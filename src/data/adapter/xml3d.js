var DataNode = require("../../xflow/interface/graph.js").DataNode;
var dispatchCustomEvent = require("../../utils/misc.js").dispatchCustomEvent;
var NodeAdapter = require("../../base/adapter.js").NodeAdapter;
var createClass = XML3D.createClass;
var AdapterHandle = require("../../base/adapterhandle.js");
var InputNode = require("../../xflow/interface/graph.js").InputNode;
var BufferEntry = require("../../xflow/interface/data.js").BufferEntry;
var XC = require("../../xflow/interface/constants.js");

// FIXME: Remove copied code! Rename to xml3d.js
/**
*
* @param {XML3DDataAdapterFactory} factory
* @param node
*/

var XML3DDataAdapter= function (factory, node) {
    NodeAdapter.call(this, factory, node);
    this.xflowDataNode = null; //System parameters
};
createClass(XML3DDataAdapter, NodeAdapter);

XML3DDataAdapter.prototype.init = function()
{
	this.xflowDataNode = new DataNode(false);
    this.xflowDataNode.addLoadListener(this.onXflowLoadEvent.bind(this));
    this.xflowDataNode.userData = this.node;
    this.xflowDataNode.systemDataAdapter = true;
	this.setDefaultValues();
	
};

XML3DDataAdapter.prototype.setDefaultValues = function(){
	var inputNode = new InputNode();
    inputNode.name="_system_time";
    inputNode.data = new BufferEntry(XC.DATA_TYPE.FLOAT, new Float32Array([0.0]));
    this.xflowDataNode.appendChild(inputNode);
    
    inputNode = new InputNode();
    inputNode.name="_system_test";
    inputNode.data = new BufferEntry(XC.DATA_TYPE.FLOAT, new Float32Array([5.0]));
    this.xflowDataNode.appendChild(inputNode);
}

XML3DDataAdapter.prototype.onXflowLoadEvent = function(node, newLevel, oldLevel){
    if(newLevel == Infinity){
        dispatchCustomEvent(this.node, 'load', false, true, null);
    }
    else if(newLevel > oldLevel){
        dispatchCustomEvent(this.node, 'progress', false, true, null);
    }
};


module.exports = XML3DDataAdapter;
