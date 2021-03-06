/** @const */
var WORLD_MATRIX_OFFSET = 0;

/**
 * @constructor
 * @param type
 * @param {Scene} scene
 * @param {Object} pageEntry
 * @param {Object} opt
 */
var RenderNode = function (type, scene, pageEntry, opt) {
    opt = opt || {};

    this.scene = scene;
    this.type = type;
    this.name = opt.name || "";
    this.page = pageEntry.page;
    this.offset = pageEntry.offset;
    this.entrySize = pageEntry.size;
    this.transformDirty = true;
    this.children = [];
    this.parent = null;

    this.setParent(opt.parent || scene.rootNode);

    this.localVisible = opt.visible !== undefined ? opt.visible : true;
    // The global visibility depends on visibility of parents
    this.visible = true;
    this.evaluateVisibility();
};

XML3D.extend(RenderNode.prototype, {

    getChildren: function () {
        return this.children;
    },

    evaluateVisibility: function() {
        var oldVisible = this.visible;
        if(this.parent && !this.parent.visible) {
            this.visible = false;
        } else {
            this.visible = this.localVisible;
        }
        if(oldVisible !== this.visible) {
            this.visibilityChanged();
            this.scene.requestRedraw && this.scene.requestRedraw("Visibility changed.");
        }
    },

    setLocalVisible: function(newVisible) {
        if (this.localVisible === newVisible) {
            return;
        }
        this.localVisible = newVisible;
        this.evaluateVisibility();
    },

    // Needs to be overwritten
    visibilityChanged: function() {},

    getParent: function () {
        return this.parent;
    },

    setParent: function (parent) {
        this.parent = parent;
        if (parent && parent.addChild) {
            parent.addChild(this);
        }
        // Reevaluate visibility, which might change due to
        // invisibility of parent
        this.evaluateVisibility();
    },

    traverse: function (callback) {
        callback(this);
        this.children.forEach(function (child) {
            child.traverse(callback);
        })
    },

    /**
     * @param {Mat4} source
     * @param {number} offset
     */
    setMat4InPage: function(source, offset) {
        var o = this.offset + offset;
        for(var i = 0; i < 16; i++, o++) {
            this.page[o] = source[i];
        }
    },

    /**
     * @param {Mat4} dest
     * @param {number} offset
     */
    getMat4FromPage: function(dest, offset) {
        var o = this.offset + offset;
        for(var i = 0; i < 16; i++, o++) {
            dest[i] = this.page[o];
        }
    },

    getWorldMatrix: function (dest) {
        if (this.transformDirty) {
            this.parent.getWorldMatrix(dest);
            this.updateWorldMatrix(dest);
        }
        this.getMat4FromPage(dest, WORLD_MATRIX_OFFSET);
    },

    setWorldMatrix: function (source) {
        this.setMat4InPage(source, WORLD_MATRIX_OFFSET);
        this.transformDirty = false;
        if (this.setBoundingBoxDirty) {
            this.setBoundingBoxDirty();
        }
    },

    setTransformDirty: function () {
        this.transformDirty = true;
    },

    remove: function () {
        this.parent.removeChild(this);
        this.scene.pager.freePageEntry({page: this.page, offset: this.offset, size: this.entrySize});
        if (this.node) {
            this.node = null;
        }
    },

    findRayIntersections: function (/* ray, closestIntersection*/) {
        //This function is overridden by groups and drawables
    }

});

module.exports = RenderNode;
