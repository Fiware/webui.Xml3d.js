var SystemNotifier = require("../../webgl/system/system-notifier.js");
var RenderNode = require("./rendernode.js");
var DrawableClosure= require("./drawableclosure.js");
var C = require("./constants.js");
var mat4 = require("gl-matrix").mat4;

// Entry:
/** @const */
var WORLD_MATRIX_OFFSET = 0;
/** @const */
var LOCAL_MATRIX_OFFSET = WORLD_MATRIX_OFFSET + 16;
/** @const */
var OBJECT_BB_OFFSET = LOCAL_MATRIX_OFFSET + 16;
/** @const */
var WORLD_BB_OFFSET = OBJECT_BB_OFFSET + 6;
/** @const */
var MODELVIEW_MATRIX_OFFSET = WORLD_BB_OFFSET + 6;
/** @const */
var MODELVIEWPROJECTION_MATRIX_OFFSET = MODELVIEW_MATRIX_OFFSET + 16;
/** @const */
var MODEL_MATRIX_N_OFFSET = MODELVIEWPROJECTION_MATRIX_OFFSET + 16;
/** @const */
var MODELVIEW_MATRIX_N_OFFSET = MODEL_MATRIX_N_OFFSET + 16;
/** @const */
var ENTRY_SIZE = MODELVIEW_MATRIX_N_OFFSET + 16;

//noinspection JSClosureCompilerSyntax,JSClosureCompilerSyntax
/**
 * Represents a renderable object in the scene.
 * The RenderObject has these responsibilities:
 *  1. Keep track of the transformation hierarchy and bounding boxes
 *  2. Connect the DrawableClosure with the ShaderClosure
 *
 *  The {@link DrawableClosure} is a DrawableObject plus it's data
 *  The {@link ShaderClosure} is a ProgramObject plus it's data
 *  The concrete ShaderClosure can vary per DrawableObject and change
 *  due to scene or object changes. Thus we have to keep track of the
 *  related {@link IShaderComposer}.
 *
 * @constructor
 * @implements {IRenderObject}
 * @param {Scene} scene
 * @param {Object} pageEntry
 * @param {Object} opt
 */
var RenderObject = function (scene, pageEntry, opt) {
    RenderNode.call(this, C.NODE_TYPE.OBJECT, scene, pageEntry, opt);
    opt = opt || {};

    /**
     * Keep reference to DOM Element need e.g. for picking
     * @type {Element}
     */
    this.node = opt.node;

    /**
     * Object related data
     * @type {{data: DataNode|null, type: string}}
     */
    this.configuration = opt.configuration || {data: null, type: "triangles"};

    /**
     * Can we rely on current WorldMatrix?
     * @type {boolean}
     */
    this.transformDirty = true;

    /**
     * Can we rely on current Bounding Boxes?
     * @type {boolean}
     */
    this.boundingBoxDirty = true;

    /**
     * The drawable closure transforms object data and type into
     * a drawable entity
     * @type {DrawableClosure}
     */
    this.drawable = this.createDrawable();

    this._material = opt.material || null;
    this._zIndex = opt.zIndex || "0";
    this._actualMaterial = null;
    this.pickId = -1;
    this.initMaterial();

    /** {Object?} **/
    this.override = null;
};
RenderObject.ENTRY_SIZE = ENTRY_SIZE;

RenderObject.IDENTITY_MATRIX = mat4.create();

XML3D.createClass(RenderObject, RenderNode, {
    createDrawable: function () {
        var result = this.scene.createDrawable(this);
        if (result) {
            var that = this;
            result.on(C.EVENT_TYPE.DRAWABLE_STATE_CHANGED, function (newState, oldState) {
                if (newState === DrawableClosure.READY_STATE.COMPLETE) {
                    that.scene.moveFromQueueToReady(that);
                } else if (newState === DrawableClosure.READY_STATE.INCOMPLETE && oldState === DrawableClosure.READY_STATE.COMPLETE) {
                    that.scene.moveFromReadyToQueue(that);
                }
            });
            result.updateTypeRequest();
            result.calculateBoundingBox();
            result.on(C.EVENT_TYPE.SCENE_SHAPE_CHANGED, function (evt) {
                that.scene.emit(C.EVENT_TYPE.SCENE_SHAPE_CHANGED);
            });
            result.on(C.EVENT_TYPE.OPACITY_STATE_CHANGED, function(oldValue, newValue) {
                that.override = that.override || {};
                that.override.opacity = newValue;
            });
        }
        return result;
    },

    getLocalMatrix: function (dest) {
        this.getMat4FromPage(dest, LOCAL_MATRIX_OFFSET);
    },

    setLocalMatrix: function (source) {
        this.setMat4InPage(source, LOCAL_MATRIX_OFFSET);
        this.setTransformDirty();
        this.setBoundingBoxDirty();
    },

    dispose: function () {
        this.scene.remove(this);
    },

    onTransformDataChange: function () {
        this.setTransformDirty();
    },

    getModelViewMatrix: function (dest) {
        this.getMat4FromPage(dest, MODELVIEW_MATRIX_OFFSET);
    },

    getModelMatrixN: function (dest) {
        var o = this.offset + MODEL_MATRIX_N_OFFSET;
        dest[0] = this.page[o];
        dest[1] = this.page[o + 1];
        dest[2] = this.page[o + 2];
        dest[3] = this.page[o + 4];
        dest[4] = this.page[o + 5];
        dest[5] = this.page[o + 6];
        dest[6] = this.page[o + 8];
        dest[7] = this.page[o + 9];
        dest[8] = this.page[o + 10];
    },

    getModelViewMatrixN: function (dest) {
        var o = this.offset + MODELVIEW_MATRIX_N_OFFSET;
        dest[0] = this.page[o];
        dest[1] = this.page[o + 1];
        dest[2] = this.page[o + 2];
        dest[3] = this.page[o + 4];
        dest[4] = this.page[o + 5];
        dest[5] = this.page[o + 6];
        dest[6] = this.page[o + 8];
        dest[7] = this.page[o + 9];
        dest[8] = this.page[o + 10];
    },


    getModelViewProjectionMatrix: function (dest) {
        this.getMat4FromPage(dest, MODELVIEWPROJECTION_MATRIX_OFFSET);
    },

    updateWorldSpaceMatrices: function (view, projection) {
        if (this.transformDirty) {
            this.updateWorldMatrix();
        }
        this.updateModelViewMatrix(view);
        this.updateModelMatrixN();
        this.updateModelViewMatrixN();
        this.updateModelViewProjectionMatrix(projection);
    },

    updateWorldMatrix: (function () {
        var tmp_mat = mat4.create();
        return function () {
            this.parent.getWorldMatrix(tmp_mat);
            var page = this.page;
            var offset = this.offset;
            XML3D.math.mat4.multiplyOffset(tmp_mat, 0, page, offset + LOCAL_MATRIX_OFFSET, tmp_mat, 0);
            this.setWorldMatrix(tmp_mat);
            this.boundingBoxDirty = true;
            this.transformDirty = false;
        }
    })(),

    /** Relies on an up-to-date transform matrix **/
    updateModelViewMatrix: function (view) {
        if (this.transformDirty) {
            this.updateWorldMatrix();
        }
        var page = this.page;
        var offset = this.offset;
        XML3D.math.mat4.multiplyOffset(page, offset + MODELVIEW_MATRIX_OFFSET, page, offset + WORLD_MATRIX_OFFSET, view, 0);
    },

    updateModelMatrixN: (function () {
        var c_tmpMatrix = mat4.create();
        return function () {
            this.getWorldMatrix(c_tmpMatrix);
            mat4.invert(c_tmpMatrix, c_tmpMatrix);
            var normalMatrix = c_tmpMatrix ? mat4.transpose(c_tmpMatrix, c_tmpMatrix) : RenderObject.IDENTITY_MATRIX;
            this.setMat4InPage(normalMatrix, MODEL_MATRIX_N_OFFSET);
        }
    })(),

    /** Relies on an up-to-date view matrix **/
    updateModelViewMatrixN: (function () {
        var c_tmpMatrix = mat4.create();
        return function () {
            this.getModelViewMatrix(c_tmpMatrix);
            mat4.invert(c_tmpMatrix, c_tmpMatrix);
            var normalMatrix = c_tmpMatrix ? mat4.transpose(c_tmpMatrix, c_tmpMatrix) : RenderObject.IDENTITY_MATRIX;
            this.setMat4InPage(normalMatrix, MODELVIEW_MATRIX_N_OFFSET);
        }
    })(),


    /** Relies on an up-to-date view matrix **/
    updateModelViewProjectionMatrix: function (projection) {
        var page = this.page;
        var offset = this.offset;
        XML3D.math.mat4.multiplyOffset(page, offset + MODELVIEWPROJECTION_MATRIX_OFFSET, page, offset + MODELVIEW_MATRIX_OFFSET, projection, 0);
    },

    setTransformDirty: function () {
        this.transformDirty = true;
        this.setBoundingBoxDirty();
        this.scene.emit(C.EVENT_TYPE.SCENE_SHAPE_CHANGED);
        this.scene.requestRedraw("Transformation changed");
    },

    setObjectSpaceBoundingBox: function (box) {
        var o = this.offset + OBJECT_BB_OFFSET;
        this.page[o] = box.data[0];
        this.page[o + 1] = box.data[1];
        this.page[o + 2] = box.data[2];
        this.page[o + 3] = box.data[3];
        this.page[o + 4] = box.data[4];
        this.page[o + 5] = box.data[5];
        this.setBoundingBoxDirty();
    },

    getObjectSpaceBoundingBox: function (box) {
        var o = this.offset + OBJECT_BB_OFFSET;
        box.data[0] = this.page[o];
        box.data[1] = this.page[o + 1];
        box.data[2] = this.page[o + 2];
        box.data[3] = this.page[o + 3];
        box.data[4] = this.page[o + 4];
        box.data[5] = this.page[o + 5];
    },

    setBoundingBoxDirty: function () {
        this.boundingBoxDirty = true;
        this.parent.setBoundingBoxDirty();
    },

    setWorldSpaceBoundingBox: function (bbox) {
        var o = this.offset + WORLD_BB_OFFSET;
        this.page[o] = bbox.data[0];
        this.page[o + 1] = bbox.data[1];
        this.page[o + 2] = bbox.data[2];
        this.page[o + 3] = bbox.data[3];
        this.page[o + 4] = bbox.data[4];
        this.page[o + 5] = bbox.data[5];
    },

    getWorldSpaceBoundingBox: function (bbox) {
        if (this.boundingBoxDirty) {
            this.updateWorldSpaceBoundingBox();
        }
        var o = this.offset + WORLD_BB_OFFSET;
        bbox.data[0] = this.page[o];
        bbox.data[1] = this.page[o + 1];
        bbox.data[2] = this.page[o + 2];
        bbox.data[3] = this.page[o + 3];
        bbox.data[4] = this.page[o + 4];
        bbox.data[5] = this.page[o + 5];

    },

    updateWorldSpaceBoundingBox: (function () {
        var c_box = new XML3D.Box();
        var c_trans = mat4.create();

        return function () {
            if(!this.visible) {
                c_box.setEmpty();
            } else {
                this.getObjectSpaceBoundingBox(c_box);
                this.getWorldMatrix(c_trans);
                c_box.transformAxisAligned(c_trans);
            }
            this.setWorldSpaceBoundingBox(c_box);
            this.boundingBoxDirty = false;
        }
    })(),

    visibilityChanged: function () {
        this.setBoundingBoxDirty();
    },

    getShaderClosure: function () {
        return this.drawable.getShaderClosure();
    },

    hasTransparency: function () {
        if (this.override && this.override.opacity !== undefined) {
            return this.override.opacity[0] < 1;
        }
        var shader = this.getShaderClosure();
        return shader ? shader.hasTransparency() : false;
    },

    updateForRendering: function () {
        SystemNotifier.setNode(this.node);
        try {
            this.drawable && this.drawable.update(this.scene);
        } catch (e) {
            XML3D.debug.logError("Mesh Error: " + e.message, this.node);
        }
        SystemNotifier.setNode(null);
    },

    findRayIntersections: (function () {
        var bbox = new XML3D.Box();
        var opt = {dist: 0};

        return function (ray, intersections) {
            this.getWorldSpaceBoundingBox(bbox);
            if (ray.intersects(bbox, opt)) {
                intersections.push(this);
            }
        }
    })(),

        /**
     * @param {MaterialConfiguration|null} material
     */
    setMaterial: function (material) {
        if(this._material === material) {
            return;
        }
        this._material = material;
        if (material) {
            this._actualMaterial = material;
        } else {
            this._actualMaterial = this.parent.getMaterial();
        }
        this.materialChanged();
    },

    setZIndex: function(zIndex){
        this._zIndex = zIndex;
    },

    parentMaterialChanged: function () {
        if (this._material) {
            // Local material overrides the change from above
            return;
        }
        this.initMaterial();
    },

    initMaterial: function () {
        if (this._material) {
            this._actualMaterial = this._material;
        } else {
            this._actualMaterial = this.parent.getMaterial();
        }
        this.materialChanged();
    },

    materialChanged: function() {
        XML3D.debug.logDebug("material changed", this._actualMaterial);
        if (this.drawable) {
            var composer = this.scene.shaderFactory.createComposerFromMaterialConfiguration(this._actualMaterial);
            this.drawable.setShaderComposer(composer);
        }
    },

    remove: function() {
        this.parent.removeChild(this);
        this.scene.pager.freePageEntry({page: this.page, offset: this.offset, size: this.entrySize});
        if (this.drawable) {
            this.drawable.destroy();
        }
    }

});


// Export
module.exports = RenderObject;

