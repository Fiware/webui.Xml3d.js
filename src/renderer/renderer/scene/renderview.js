var RenderNode = require("./rendernode.js");
var CameraModels = require("../cameras/camera-models.js");
var Constants = require("./constants.js");
var Frustum = require("../tools/frustum.js").Frustum;
var vec3 = require("gl-matrix").vec3;
var mat4 = require("gl-matrix").mat4;

/** @const */
var CLIPPLANE_NEAR_MIN = 0.01;

var NODE_TYPE = Constants.NODE_TYPE;
var EVENT_TYPE = Constants.EVENT_TYPE;

var LOCAL_MATRIX_OFFSET = 16;
/** @const */
var WORLD_TO_VIEW_MATRIX_OFFSET = LOCAL_MATRIX_OFFSET + 16;
/** @const */
var PROJECTION_MATRIX_OFFSET = WORLD_TO_VIEW_MATRIX_OFFSET + 16;
/** @const */
var ENTRY_SIZE = PROJECTION_MATRIX_OFFSET + 16;

var DEFAULT_CAMERA_CONFIGURATION = { model: "urn:xml3d:view:perspective", dataNode: null };

/**
 *
 * @constructor
 * @extends {RenderNode}
 */
var RenderView = function (scene, pageEntry, opt) {
    RenderNode.call(this, NODE_TYPE.VIEW, scene, pageEntry, opt);
    opt = opt || {};

    /**
     * World to view matrix
     * @type {Float32Array}
     * @private
     */
    this._viewMatrix = new Float32Array(this.page.buffer, (this.offset + WORLD_TO_VIEW_MATRIX_OFFSET) * Float32Array.BYTES_PER_ELEMENT, 16);

    /**
     * Can we rely on the world to view matrix?
     * @type {boolean}
     */
    this.viewMatrixDirty = true;
    this.worldSpacePosition = vec3.create();


    this._projectionMatrix = new Float32Array(this.page.buffer, (this.offset + PROJECTION_MATRIX_OFFSET) * Float32Array.BYTES_PER_ELEMENT, 16);
    this.lastAspectRatio = 1;
    this.projectionDirty = true;
    this.camera = createCamera(opt.camera ? opt.camera : DEFAULT_CAMERA_CONFIGURATION, scene, this);
    this.frustum = null;
};
RenderView.ENTRY_SIZE = ENTRY_SIZE;

XML3D.createClass(RenderView, RenderNode, {

    getFrustum: function () {
        return this.frustum;
    },

    updateViewMatrix: function () {
        var viewMatrix = this._viewMatrix;
        this.getWorldMatrix(viewMatrix);
        vec3.set(this.worldSpacePosition, viewMatrix[12], viewMatrix[13], viewMatrix[14]);
        mat4.invert(viewMatrix, viewMatrix);
        this.viewMatrixDirty = false;
        // View frustum might have changed due to clipping planes
        this.viewFrustumChanged();
    },

    onTransformDirty: function () {
        this.viewMatrixDirty = true;
        this.worldMatrixDirty = true;
        this.scene.requestRedraw("view pose changed");
    },

    getViewToWorldMatrix: function (dest) {
        this.getWorldMatrix(dest);
    },

    getWorldToViewMatrix: function (dest) {
        if (this.viewMatrixDirty) {
            this.updateViewMatrix();
        }
        if (dest) {
            mat4.copy(dest, this._viewMatrix);
            return dest;
        }
        return this._viewMatrix;
    },

    getProjectionMatrix: function (dest, aspect) {
        if (this.projectionDirty || Math.abs(aspect - this.lastAspectRatio) > 0.001 ) {
            // Set projectionMatrix
            this.frustum = this.camera.getFrustum(aspect);
            if(this.frustum) {
                this.frustum.getProjectionMatrix(this._projectionMatrix);
            } else {
                this.camera.getProjectionMatrix(this._projectionMatrix)
            }
            this.lastAspectRatio = aspect;
            this.projectionDirty = false;
        }
        if(dest) {
            return mat4.copy(dest, this._projectionMatrix);
        }
        return this._projectionMatrix;
    },

    getWorldSpacePosition: function () {
        return this.worldSpacePosition;
    },

    getWorldSpaceBoundingBox: function (bbox) {
        bbox.setEmpty();
    },

    viewFrustumChanged: function() {
        this.projectionDirty = true;
        this.scene.requestRedraw("view frustum changed");
    },

    getClippingPlanes: function(bb) {
        if(!bb) {
            bb = new XML3D.Box();
            this.scene.getBoundingBox(bb);
        }
        if (bb.isEmpty()) {
            return {near: 1, far: 10};
        }
        var w2v = mat4.create();
        this.getWorldToViewMatrix(w2v);
        bb.transformAxisAligned(w2v);

        var near = -bb.max.z, far = -bb.min.z, expand = Math.max((far - near) * 0.005, 0.05);

        // Expand the view frustum a bit to ensure 2D objects parallel to the camera are rendered
        near = Math.max(near - expand, expand, CLIPPLANE_NEAR_MIN);
        far = Math.max(far + expand, near + expand);
        return {near: near, far: far};
    }
});

/**
 * @param {Configuration} configuration
 * @param {Scene} scene
 * @param {RenderView} owner
 * @returns {Object}
 */
function createCamera(configuration, scene, owner) {

    switch(configuration.model) {
        case "urn:xml3d:view:perspective":
            return new CameraModels.PerspectiveCameraModel(configuration.dataNode, scene, owner);
        case "urn:xml3d:view:projective":
            return new CameraModels.ProjectiveCameraModel(configuration.dataNode, scene, owner);
        default:
            XML3D.debug.logWarning("Unknown camera model:", configuration.model);
            return new CameraModels.PerspectiveCameraModel(configuration.dataNode, scene, owner);
    }


}

// Export
module.exports = RenderView;

