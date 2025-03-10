﻿"use strict";
// Copyright 2012 United States Government, as represented by the Secretary of Defense, Under
// Secretary of Defense (Personnel & Readiness).
// 
// Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except
// in compliance with the License. You may obtain a copy of the License at
// 
//   http://www.apache.org/licenses/LICENSE-2.0
// 
// Unless required by applicable law or agreed to in writing, software distributed under the License
// is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
// or implied. See the License for the specific language governing permissions and limitations under
// the License.
function setClone(ab) {
    var f32 = new Float32Array(ab.length);
    f32.set(ab);
    return f32;
}

function getURLParameter(name) {
    return decodeURI(
        (RegExp(name + '=' + '(.+?)(&|$)').exec(location.search) || [, null])[1]
    );
}

function matset(newv, old) {
    if (!old) {
        newv = old;
        return;
    }
    if (!newv)
        newv = [];
    for (var i = 0; i < old.length; i++)
        newv[i] = old[i];
    return newv;
}

function disregardMouseInputsToSim() {
    if (window._Editor && (window._Editor.GetSelectMode() == 'Pick' || window._Editor.GetSelectMode() == 'TempPick')) {
        return true;
    }
    return false;
}


var pfx = ["webkit", "moz", "ms", "o", ""];

define(["module", "vwf/view", 'vwf/utility/eventSource', "vwf/view/threejs/viewNode", "vwf/model/threejs/OculusRiftEffect", "vwf/model/threejs/ThermalCamEffect", "vwf/model/threejs/VRRenderer", "vwf/view/threejs/editorCameraController", "vwf/view/threejs/SandboxRenderer"], function(module, view, eventSource, viewNode) {
    var stats;
    var NORMALRENDER = 0;
    var STEREORENDER = 1;
    var VRRENDER = 2;
    var everyOtherFrame = false;
    var glext_ft = null;

    return view.load(module, {

        renderMode: NORMALRENDER,
        effects: [],
        topCamera: new THREE.OrthographicCamera(1, -1, 1, -1, 0, 10000),
        leftCamera: new THREE.OrthographicCamera(1, -1, 1, -1, 0, 10000),
        frontCamera: new THREE.OrthographicCamera(1, -1, 1, -1, 0, 10000),
        vrHMDSensor: null,
        vrHMD: null,
        vrRenderer: null,
        editorCamera: new THREE.PerspectiveCamera(35, $(document).width() / $(document).height(), .01, 10000),
        shareCamera: false,
        receiveSharedCamera: false,
        cameraShareLoop: function() {
            if (this.shareCamera) {
                vwf_view.kernel.callMethod(Engine.application(), 'cameraShareInfo', [Engine.moniker(), this.getCamera().matrixWorld.elements])
                window.setTimeout(this.cameraShareLoop.bind(this), 33);
            }
        },
        shareCameraView: function() {
            this.shareCamera = true;
            this.receiveSharedCamera = false;
            vwf_view.kernel.callMethod(Engine.application(), 'startCameraShare', [Engine.moniker()]);
            this.cameraShareLoop();
        },
        receiveSharedCameraView: function() {
            this.shareCamera = false;
            this.receiveSharedCamera = true;
            require("vwf/view/threejs/editorCameraController").setCameraMode(null);
        },
        stopShareCameraView: function() {
            this.shareCamera = false;
            this.receiveSharedCamera = true;
            vwf_view.kernel.callMethod(Engine.application(), 'stopCameraShare', [Engine.moniker()]);
        },
        simulateContextLoss: function() {
            var cx = _dRenderer.context.getExtension('WEBGL_lose_context');
            cx.loseContext();
            window.setTimeout(function() {
                cx.restoreContext();
            }, 1000);

        },
        toggleFullScreen: function() {

            if (RunPrefixMethod(document, "FullScreen") || RunPrefixMethod(document, "IsFullScreen")) {
                RunPrefixMethod(document, "CancelFullScreen");
            } else {
                if (this.vrHMD && this.renderMode == VRRENDER) {
                    //RunPrefixMethod($('#index-vwf')[0], "RequestFullScreen", {
                    //    vrDisplay: this.vrHMD
                    //});
                    var canvas = $('#index-vwf')[0];
                    canvas.webkitRequestFullscreen({
                        vrDisplay: this.vrHMD
                    });
                } else
                    RunPrefixMethod(document.body, "RequestFullScreen", 1);
            }
        },
        initHMD: function() {

            function vrDeviceCallback(vrdevs) {

                for (var i = 0; i < vrdevs.length; ++i) {
                    if (vrdevs[i] instanceof HMDVRDevice) {
                        _dView.vrHMD = vrdevs[i];
                        break;
                    }
                }
                for (var i = 0; i < vrdevs.length; ++i) {
                    if (vrdevs[i] instanceof PositionSensorVRDevice &&
                        vrdevs[i].hardwareUnitId == _dView.vrHMD.hardwareUnitId) {
                        _dView.vrHMDSensor = vrdevs[i];

                        alertify.log('WebVR compatable HMD detected');
                        break;
                    }
                }
                alertify.log('No WebVR HMD available');
            }

            if (navigator.getVRDevices) {
                navigator.getVRDevices().then(vrDeviceCallback);
            } else if (navigator.mozGetVRDevices) {
                navigator.mozGetVRDevices(vrDeviceCallback);
            } else {
                alertify.log('WebVR not supported');
            }

        },
        glyphs: [],
        addGlyph: function(id, url) {

            if (this.glyphs.indexOf(id) == -1)
                this.glyphs.push(id);
            else {
                $('#glyph' + ToSafeID(id)).attr('src', url);
                return;
            }

            var newdiv = document.createElement('img');

            $(newdiv).addClass('glyph');
            $(newdiv).attr('vwfid', id);
            newdiv.style.position = 'absolute';
            newdiv.id = ToSafeID('glyph' + id);
            //newdiv.innerHTML = "" + this.name;
            $(newdiv).attr('src', url);
            newdiv.style.left = '0px';
            newdiv.style.top = '0px';
            newdiv.tabIndex = 10;
            $('#glyphOverlay').append(newdiv);
            $(newdiv).disableSelection();
            $(newdiv).mousedown(function(e) {
                console.log('glyph mousedown');
                $('#index-vwf').focus();
                if (_Editor.GetSelectMode() == "None" || e.which != 1) $('#index-vwf').trigger(e)
            });
            $(newdiv).mouseup(function(e) {
                console.log('glyph mouseup');
                $('#index-vwf').focus();
                $('#index-vwf').trigger(e)
            });
            $(newdiv).mousemove(function(e) {
                $('#index-vwf').trigger(e)
            });
            $(newdiv).click(function(e) {
                console.log('glyph click');
                $('#index-vwf').focus();
                if (_Editor.GetSelectMode() != "None") _Editor.SelectObjectPublic(id)
            });

        },
        removeGlyph: function(id) {
            if (this.glyphs.indexOf(id) == -1)
                return
            else {
                $('#glyph' + ToSafeID(id)).remove();
                this.glyphs.splice(this.glyphs.indexOf(id), 1);
                return;
            }
        },
        showGlyph: function(id) {
            if (this.glyphs.indexOf(id) == -1)
                return
            else {
                $('#glyph' + ToSafeID(id)).show();
                return;
            }
        },
        hideGlyph: function(id) {
            if (this.glyphs.indexOf(id) == -1)
                return
            else {
                $('#glyph' + ToSafeID(id)).hide();
                return;
            }
        },
        updateGlyphs: function(e, viewprojection, wh, ww) {

            if (Engine.getPropertyFast(Engine.application(), 'playMode') == 'play' && (_DataManager.getInstanceData().publishSettings.allowPlayPause === true || _DataManager.getInstanceData().publishSettings.allowPlayPause === undefined)) return;
            for (var i = 0; i < this.glyphs.length; i++) {
                if (Engine.getPropertyFast(this.glyphs[i], 'showGlyph') == false) continue;
                var div = $('#glyph' + ToSafeID(this.glyphs[i]))[0];
                if (!div) continue;

                var trans = Engine.getPropertyFast(this.glyphs[i], 'worldTransform');

                var pos = [trans[12], trans[13], trans[14], 1];


                var screen = MATH.mulMat4Vec4(viewprojection, pos);
                screen[0] /= screen[3];
                screen[1] /= screen[3];

                screen[0] /= 2;
                screen[1] /= 2;
                screen[2] /= 2;
                screen[0] += .5;
                screen[1] += .5;


                screen[0] *= ww;
                screen[1] *= wh;


                screen[1] = wh - screen[1];

                div.style.top = (screen[1] - 10) + 'px';
                div.style.left = (screen[0] - 10) + 'px';


                if ((screen[0] < 0 || screen[0] > ww || screen[1] < 0 || screen[1] > wh)) {
                    if (div.style.display != 'none')
                        div.style.display = 'none';
                } else {
                    if ((screen[2] > 10 || screen[2] < 0) && div.style.display != 'none')
                        div.style.display = 'none';
                    if (screen[2] < 10 && screen[2] > 0 && div.style.display == 'none')
                        div.style.display = 'block';
                }
            }
        },
        addEffect: function(effect) {
            this.effects.push(effect);
        },
        removeEffect: function(effect) {
            this.effects.splice(this.effects.indexOf(effect), 1);
        },
        activateRiftEffect: function() {
            var effect = new THREE.OculusRiftEffect(_dRenderer, {
                worldScale: 1
            });
            effect.setSize(parseInt($("#index-vwf").css('width')), parseInt($("#index-vwf").css('height')));
            this.addEffect(effect);
            Engine.callMethod(Engine.application(), 'activteOculusBridge')
        },
        activateThermalCamEffect: function() {
            var effect = new THREE.ThermalCamEffect(_dRenderer, _dScene, this.getCamera());
            effect.setSize(parseInt($("#index-vwf").css('width')), parseInt($("#index-vwf").css('height')));
            this.addEffect(effect);
        },
        initialize: function(rootSelector) {


            eventSource.call(this, 'View');
            this.initHMD();

            rootSelector = {
                "application-root": '#vwf-root'
            };
            if (!this.events)
                this.events = {};

            $(document).on('selectionChanged', this.selectionChanged.bind(this));


            this.renderTargetPasses = [];
            this.rootSelector = rootSelector;
            this.height = 600;
            this.width = 800;
            this.canvasQuery = null;
            if (window && window.innerHeight) this.height = window.innerHeight - 20;
            if (window && window.innerWidth) this.width = window.innerWidth - 20;
            this.keyStates = {
                keysDown: {},
                mods: {},
                keysUp: {}
            };


            this.stats = new THREE.Stats();
            this.stats.domElement.style.position = 'absolute';
            this.stats.domElement.style.top = '0px';
            this.stats.domElement.style.zIndex = 100000;
            document.body.appendChild(this.stats.domElement);

            stats = this.stats;
            window.stats = stats;
            window.stats.domElement.style.display = 'none';
            window._dView = this;

            $(document).on('setstatebegin', function() {
                this.paused = true;
            }.bind(this));
            $(document).on('setstatecomplete', function() {
                this.paused = false;
                $('#index-vwf').fadeIn();


            }.bind(this));

            this.nodes = {};
            this.interpolateTransforms = true;
            this.tickTime = 0;
            this.realTickDif = 50;
            this.lastrealTickDif = 50;
            this.lastRealTick = performance.now();
            this.leftover = 0;
            this.future = 0;



        },
        lerp: function(a, b, l, c) {
            //if(c) l = Math.min(1,Math.max(l,0));
            return (b * l) + a * (1.0 - l);
        },
        matCmp: function(a, b, delta) {
            for (var i = 0; i < 16; i++) {
                if (Math.abs(a[i] - b[i]) > delta)
                    return false;
            }
            return true;
        },
        rotMatFromVec: function(x, y, z) {
            var n = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
            n[0] = x[0];
            n[1] = x[1];
            n[2] = x[2];
            n[4] = y[0];
            n[5] = y[1];
            n[6] = y[2];
            n[8] = z[0];
            n[9] = z[1];
            n[10] = z[2];
            return n;
        },
        matrixLerp: function(a, b, l, n) {
            if (!n) n = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];


            var x = [a[0], a[1], a[2]];
            var xl = Vec3.magnitude(x);

            var y = [a[4], a[5], a[6]];
            var yl = Vec3.magnitude(y);

            var z = [a[8], a[9], a[10]];
            var zl = Vec3.magnitude(z);


            var x2 = [b[0], b[1], b[2]];
            var xl2 = Vec3.magnitude(x2);

            var y2 = [b[4], b[5], b[6]];
            var yl2 = Vec3.magnitude(y2);

            var z2 = [b[8], b[9], b[10]];
            var zl2 = Vec3.magnitude(z2);

            var nxl = this.lerp(xl, xl2, l);
            var nyl = this.lerp(yl, yl2, l);
            var nzl = this.lerp(zl, zl2, l);

            x = Vec3.normalize(x, []);
            y = Vec3.normalize(y, []);
            z = Vec3.normalize(z, []);

            x2 = Vec3.normalize(x2, []);
            y2 = Vec3.normalize(y2, []);
            z2 = Vec3.normalize(z2, []);

            var q = Quaternion.fromRotationMatrix4(this.rotMatFromVec(x, y, z), []);
            var q2 = Quaternion.fromRotationMatrix4(this.rotMatFromVec(x2, y2, z2), []);

            var nq = Quaternion.slerp(q, q2, l, []);
            var nqm = Quaternion.toRotationMatrix4(nq, []);


            var nx = [nqm[0], nqm[1], nqm[2]];
            var ny = [nqm[4], nqm[5], nqm[6]];
            var nz = [nqm[8], nqm[9], nqm[10]];

            nx = Vec3.scale(nx, nxl, []);
            ny = Vec3.scale(ny, nyl, []);
            nz = Vec3.scale(nz, nzl, []);


            nqm = this.rotMatFromVec(nx, ny, nz);

            nqm[12] = n[12];
            nqm[13] = n[13];
            nqm[14] = n[14];

            nqm[12] = this.lerp(a[12], b[12], l);
            nqm[13] = this.lerp(a[13], b[13], l);
            nqm[14] = this.lerp(a[14], b[14], l);

            return nqm;
        },
        viewTransformOverrides: {},
        setViewTransformOverride: function(nodeID, transform) {
            if (transform) {
                this.viewTransformOverrides[nodeID] = {
                    override: transform,
                    original: null,
                };
            } else {
                delete this.viewTransformOverrides[nodeID];
            }

        },
        applyViewTransformOverrides: function() {
            for (var i in this.viewTransformOverrides) {
                var node = findviewnode(i);
                if (node) {
                    var original = (new THREE.Matrix4()).copy(node.matrix);
                    this.viewTransformOverrides[i].original = original;
                    node.matrix.elements = (this.viewTransformOverrides[i].override)
                    node.updateMatrixWorld(true);
                }
            }
        },
        restoreViewTransformOverrides: function() {
            for (var i in this.viewTransformOverrides) {
                var node = findviewnode(i);
                if (node) {
                    node.matrix.copy(this.viewTransformOverrides[i].original)
                    node.updateMatrixWorld(true);
                }
            }
        },

        setInterpolatedTransforms: function(deltaTime) {

            this.trigger('interpStart');
            var keys = Object.keys(this.nodes);
            var now = performance.now();
            var playmode = Engine.getPropertyFast(Engine.application(), 'playmode');
            for (var j = 0; j < keys.length; j++) {
                var i = keys[j];
                var node = this.nodes[i];
                if (!node) continue;
                node.interpolate(now, playmode);
            }
            _dScene.updateMatrixWorld();
            this.trigger('interpEnd');
        },
        windowResized: function() {
            //called on window resize by windowresize.js
            for (var i = 0; i < this.effects.length; i++) {
                this.effects[i].setSize(parseInt($("#index-vwf").css('width')), parseInt($("#index-vwf").css('height')));
            }
        },
        triggerWindowResize: function() {
            //overcome by code in WindowResize.js
            $(window).resize();
            return;
        },
        restoreTransforms: function() {

            this.trigger('interpRestoreStart');
            var keys = Object.keys(this.nodes);
            for (var j = 0; j < keys.length; j++) {
                var i = keys[j];
                var node = this.nodes[i];
                if (!node) return;
                node.restore();
            }
            _dScene.updateMatrixWorld();
            this.trigger('interpRestoreEnd');
        },
        setRenderModeStereo: function() {
            this.renderMode = STEREORENDER;
            this.triggerWindowResize();
        },
        setRenderModeVR: function() {
            this.renderMode = VRRENDER;
            hideTools();
            this.toggleFullScreen();
            Engine.callMethod(Engine.application(), 'activteOculusBridge');
            //this.triggerWindowResize();
        },
        setRenderModeNormal: function() {
            this.renderMode = NORMALRENDER;
            this.triggerWindowResize();
        },
        ticklocal: function() {


        },
        ticked: function() {
            //so, here's what we'll do. Since the sim state cannot advance until tick, we will update on tick. 
            //but, ticks aren't fired when the scene in paused. In that case, we'll do it every frame.
            _SceneManager.update();
            var keys = Object.keys(this.nodes);
            for (var j = 0; j < keys.length; j++) {
                var i = keys[j];
                var node = this.nodes[i];
                if (!node) return;
                node.tick();
            }
        },
        deletedNode: function(childID) {
            delete this.nodes[childID];
            this.removeGlyph(childID);
            //be sure not to keep around a reference to an object that no longer exists
            if (this.lastPickId == childID) {
                this.lastPickId = null;
                this.lastPick = null;
            }
        },
        createdNode: function(nodeID, childID, childExtendsID, childImplementsIDs,
            childSource, childType, childURI, childName, callback /* ( ready ) */ ) {

            if (childID != 'http-vwf-example-com-camera-vwf-camera')
                this.nodes[childID] = new viewNode(childID, childExtendsID, this.state.nodes[childID], Engine.isSimulating(childID));

            /*{
                    id: childID,
                    extends: childExtendsID,
                    properties: {},
                    lastTransformStep: 0,
                    lastAnimationStep: 0
                };*/

            //man VWF makes this stuff so hard. Why must we deal with this? Who though that a game engine needed prototypical inheritance?
            //why must every driver deal with this crap? The design of this thing is ridiculous.
            //here, we must deal with the fact that we might never see a setproperty for a node based on one of the standard types
            //because the property for the glyphURL is defined on the prototype
            var glyph = Engine.getProperty(childExtendsID, 'glyphURL');
            if (glyph) {
                this.addGlyph(childID, glyph);
            }
            var showGlyph = Engine.getProperty(childExtendsID, 'showGlyph');
            if (showGlyph) {
                this.showGlyph(childID);
            } else
                this.hideGlyph(childID);
            //the created node is a scene, and has already been added to the state by the model.
            //how/when does the model set the state object? 

            if (this.state.scenes[childID]) {
                var threeview = this;
                var domWin = window;


                //this.canvasQuery = jQuery(this.rootSelector["application-root"]).append("<canvas id='" + 'index-vwf' + "' width='" + this.width + "' height='" + this.height + "' class='vwf-scene'/>").children(":last");
                this.canvasQuery = jQuery('canvas#index-vwf');
                this.canvasQuery.css('display', 'none');
                this.canvasQuery.css('box-sizing', 'border-box');
                initScene.call(this, this.state.scenes[childID]);
                require("vwf/view/threejs/editorCameraController").initialize(this.editorCamera);

                var instanceData = _DataManager.getInstanceData();
                var publishSettings = instanceData.publishSettings;
                if (publishSettings)
                    this.cameraID = publishSettings.camera;
                this.setCamera(this.cameraID);
            }
        },


        // -- deletedNode ------------------------------------------------------------------------------

        //deletedNode: function( nodeID ) { },

        // -- addedChild -------------------------------------------------------------------------------

        //addedChild: function( nodeID, childID, childName ) { },

        // -- removedChild -----------------------------------------------------------------------------

        //removedChild: function( nodeID, childID ) { },

        // -- createdProperty --------------------------------------------------------------------------

        //createdProperty: function (nodeID, propertyName, propertyValue) { },

        // -- initializedProperty ----------------------------------------------------------------------

        initializedProperty: function(nodeID, propertyName, propertyValue) {
            this.satProperty(nodeID, propertyName, propertyValue);
        },

        // TODO: deletedProperty

        // -- satProperty ------------------------------------------------------------------------------
        getCamera: function() {
            if (!this.activeCamera)
                return this.editorCamera;
            return this.activeCamera;
        },
        getCameraList: function() {
            var namelist = ['Editor Camera'];
            var idlist = [''];

            var keys = Object.keys(this.nodes);

            for (var j = 0; j < keys.length; j++) {
                var i = keys[j];
                if (this.nodes[i].extends == 'SandboxCamera-vwf') {
                    idlist.push(i);
                    namelist.push(Engine.getProperty(i, 'DisplayName'));
                }
            }
            return [namelist, idlist];
        },
        chooseCamera: function() {
            var namelist = ['Editor Camera'];
            var idlist = [''];

            var keys = Object.keys(this.nodes);

            for (var j = 0; j < keys.length; j++) {
                var i = keys[j];
                if (this.nodes[i].extends == 'SandboxCamera-vwf') {
                    idlist.push(i);
                    namelist.push(Engine.getProperty(i, 'DisplayName') + "   (" + namelist.length + ')');
                }
            }

            alertify.choice('Choose Scene Camera', function(ok, val) {
                if (ok) {
                    for (var i = 0; i < namelist.length; i++)
                        if (namelist[i] == val)
                            _dView.setCamera(idlist[i]);


                }
            }, namelist);
        },
        selectionChanged: function(e, selection) {

            this.selection = selection;

            if (this.cameraHelper) {
                this.cameraHelper.parent.remove(this.cameraHelper);
                this.cameraHelper = null;
            }
            if (this.selection && Engine.getProperty(this.selection.id, 'type') == 'Camera') {
                var selnode = _Editor.findviewnode(this.selection.id);
                if (selnode) {
                    var selcam = selnode.children[0];
                    this.cameraHelper = new THREE.CameraHelper(selcam);
                    this.cameraHelper.InvisibleToCPUPick = true;
                    selcam.add(this.cameraHelper, true);
                }
            }


        },
        setCamera: function(camID) {
            vwf_view.kernel.callMethod(Engine.application(), 'setClientCamera', [Engine.moniker(), camID]);
            if (camID) {
                Engine.requestControl(camID);
            }
        },
        setCamera_internal: function(camID) {

            var defaultCameraID;
            var instanceData = _DataManager.getInstanceData();
            var publishSettings = instanceData.publishSettings;

            if (publishSettings) defaultCameraID = publishSettings.camera;

            this.cameraID = camID || defaultCameraID;

            //allow the default 
            if (publishSettings)
                if (!camID && publishSettings.allowTools)
                    this.cameraID = null;

            var cam = this.editorCamera;

            if (camID === 'top')
                cam = this.topCamera;
            if (this.cameraID) {

                cam = null;
                if (this.state.nodes[this.cameraID])
                    if (this.state.nodes[this.cameraID].getRoot && this.state.nodes[this.cameraID].getRoot()) {
                        cam = this.state.nodes[this.cameraID].getRoot();
                    }
            }
            if (camID === 'top')
                cam = this.topCamera;
            if (camID === 'left')
                cam = this.leftCamera;
            if (camID === 'front')
                cam = this.frontCamera;

            if (cam) {
                var aspect = $('#index-vwf').width() / $('#index-vwf').height();
                cam.aspect = aspect;
                cam.updateProjectionMatrix();
            }
            this.activeCamera = cam;

        },
        inDefaultCamera: function() {
            return this.cameraID == null || this.cameraID == '' || this.cameraID == undefined;
        },
        setCameraDefault: function() {
            this.setCamera();
        },
        calledMethod: function(id, method, args) {
            if (id == Engine.application() && method == 'setClientCamera') {
                if (Engine.moniker() == args[0]) {
                    this.setCamera_internal(args[1]);
                }
            }
            else if (method == 'ready' || method == 'reset_interp') {
                var node = this.nodes[id];
                if (!node) return;
                node.reset_interp();
            }
            else if (method == 'startSimulatingNode') {
                if (this.nodes[args])
                    this.nodes[args].setSim(true);
            }
            else if (method == 'stopSimulatingNode') {
                if (this.nodes[args])
                    this.nodes[args].setSim(false);
            }
            else if (id == Engine.application() && method == 'cameraShareInfo') {
                if (this.receiveSharedCamera) {
                    this.setCamera();
                    this.getCamera().matrixAutoUpdate = false;
                    this.getCamera().matrixWorld.fromArray(args[1]);
                    this.getCamera().matrix.fromArray(args[1]);

                }
            }
            else if (id == Engine.application() && method == 'startCameraShare') {
                if (!this.receiveSharedCamera && Engine.moniker() !== args[0]) {
                    var self = this;
                    alertify.confirm('A user would like to share their camera view. Accept?', function(ok) {
                        if (ok) {
                            self.receiveSharedCameraView();
                        }
                    })
                }
            }
            else if (id == Engine.application() && method == 'stopCameraShare') {
                this.receiveSharedCamera = false;
                //   require("vwf/view/threejs/editorCameraController").getController('Orbit').orbitPoint(newintersectxy);
                require("vwf/view/threejs/editorCameraController").setCameraMode('Orbit');
                require("vwf/view/threejs/editorCameraController").updateCamera();
                this.getCamera().matrixAutoUpdate = false;
            }
        },
        createdProperty: function(nodeID, propertyName, propertyValue) {
            this.satProperty(nodeID, propertyName, propertyValue);
        },

        satProperty: function(nodeID, propertyName, propertyValue) {

            //console.log([nodeID,propertyName,propertyValue]);
            //note! this is different than this.nodes, which stores data for this particualr driver
            //this.state.nodes is shared with the threejs model!
            var node = this.state.nodes[nodeID];
            if (!node) node = this.state.scenes[nodeID];
            if (!this.nodes[nodeID]) return;
            //this driver has no representation of this node, so there is nothing to do.
            if (!node) return;

            var value = undefined;
            if (this.nodes)
                this.nodes[nodeID].setProperty(propertyName, propertyValue);



            node[propertyName] = propertyValue;


            var threeObject = node.threeObject;
            if (!threeObject)
                threeObject = node.threeScene;

            //There is not three object for this node, so there is nothing this driver can do. return
            if (!threeObject) return value;

            if (node && propertyName == 'glyphURL') {
                if (propertyValue)
                    this.addGlyph(nodeID, propertyValue);
                else
                    this.removeGlyph(nodeID);
            }
            if (node && propertyName == 'showGlyph') {
                if (propertyValue)
                    this.showGlyph(nodeID);
                else
                    this.hideGlyph(nodeID);
            }
            if (node && threeObject && propertyValue !== undefined) {

            }


        },
        createRenderTarget: function(cameraID) {

            var rtt = new THREE.WebGLRenderTarget(256, 256, {
                format: THREE.RGBAFormat,
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter
            });
            this.renderTargetPasses.push({
                camera: cameraID,
                target: rtt
            });
            return rtt;
        },
        deleteRenderTarget: function(rtt) {
            for (var i = 0; i < this.renderTargetPasses.length; i++) {
                if (this.renderTargetPasses[i].target == rtt)
                    this.renderTargetPasses.splice(i, 1);
            }
        },



        // -- gotProperty ------------------------------------------------------------------------------

        //gotProperty: function ( nodeID, propertyName, propertyValue ) { },


    });
    // private ===============================================================================
    function initScene(sceneNode) {


        var self = this;
        var requestAnimFrame, cancelAnimFrame;
        (function() {
            var lastTime = 0;
            var vendors = ['ms', 'moz', 'webkit', 'o'];
            for (var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
                window.requestAnimationFrame = window[vendors[x] + 'RequestAnimationFrame'];
                window.cancelRequestAnimationFrame = window[vendors[x] +
                    'CancelRequestAnimationFrame'];
            }

            if (!window.requestAnimationFrame) {
                requestAnimFrame = window.requestAnimationFrame = function(callback, element) {
                    var currTime = +new Date;
                    var timeToCall = Math.max(0, 16 - (currTime - lastTime));
                    var id = window.setTimeout(function() {
                            callback(currTime + timeToCall);
                        },
                        timeToCall);
                    lastTime = currTime + timeToCall;
                    return id;
                };
            } else {
                requestAnimFrame = window.requestAnimationFrame;
            }

            if (!window.cancelAnimationFrame) {
                cancelAnimFrame = window.cancelAnimationFrame = function(id) {
                    clearTimeout(id);
                };
            } else {
                cancelAnimFrame = window.cancelAnimationFrame;
            }
        }());

        function GetParticleSystems(node, list) {

            return window.particleRegistry;
        }

        function resetMaterial(material) {

            if (!material) {
                return;
            }
            if (material instanceof THREE.MeshFaceMaterial) {
                for (var i in material.materials) {
                    resetMaterial(material.materials[i])
                }
                return;

            }

            //if the material is alread inited
            if (material.__webglShader) {

                //find all textures in the material, and re-init
                for (var i in material.__webglShader.uniforms) {
                    if (material.__webglShader.uniforms[i].type == 't') {
                        var tex = material.__webglShader.uniforms[i].value;

                        //don't forget cubemaps, slightly differnet under the hood
                        if (tex && tex instanceof THREE.Texture) {
                            if (tex.image && tex.image.length) {
                                tex.image.__webglTextureCube = undefined;
                            }
                            tex.__webglInit = undefined;
                            tex.__webglTexture = undefined;
                            tex.needsUpdate = true;
                        }

                        //since we hit the shadow targets on the light, not necessary to also hit them when found in materials
                        if (tex && tex instanceof THREE.WebGLRenderTarget && i != 'shadowMap') {

                            tex.dispose();
                            tex.__webglFramebuffer = undefined;
                            tex.__webglRenderbuffer = undefined;
                            tex.__webglTexture = undefined;

                        }


                    }

                }
            }


            //if the material has any custom vertex attributes (particle system use this heavily)
            //the webgl buffers for those attributes have to be reinited
            if (material.attributes) {
                for (var i in material.attributes) {
                    material.attributes[i].buffer = undefined;
                    material.attributes[i].__webglInitialized = undefined;
                }
            }
            //mark material for general update - should rebuild shaders and uniforms at webgl level
            material.dispose();
            material.__webglShader = null;
            material.needsUpdate = true;

        }


        var timepassed;
        var now;
        var cam;
        var t;
        var l;
        var w;
        var h;
        var wh;
        var ww;
        var selcam;
        var oldaspect;
        var camback;
        var _viewProjectionMatrix = new THREE.Matrix4();
        var insetvp;
        var pss;
        var vp;
        var rootdiv;
        var minD;
        var temparray = [];
        var camback;
        var insetvp;
        var vpargs = [];
        var documentselector = $(document);

        function renderScene(time) {


            self.trigger('preFrame');
            requestAnimFrame(renderScene);


            //lets not render when the quere is not ready. This prevents rendering of meshes that must have their children
            //loaded before they can render
            if (!window._dRenderer) {
                return;
            }
            //so, here's what we'll do. Since the sim state cannot advance until tick, we will update on tick. 
            //but, ticks aren't fired when the scene in paused. In that case, we'll do it every frame.
            var currentState = Engine.getPropertyFast(Engine.application(), 'playMode');
            if (currentState === 'stop') _SceneManager.update();


            //get the camera. If a default was specified, but not yet availabe, get the system default.
            cam = self.getCamera();
            //if for some reason even the system default is not availabe, wait a frame
            if (!cam) return;


            //if we have a camera, but self.activecamera is null, then we were expecting a default camera, but it was not yet available
            //try to set it, so next frame we use it. 
            if (!self.activeCamera) self.setCamera_internal(self.cameraID);

            if (self.paused === true)
                return;
            self.inFrame = true;
            sceneNode.frameCount++;
            now = (window.performance !== undefined && window.performance.now !== undefined) ? window.performance.now() : time;

            timepassed = now - sceneNode.lastTime;

            window.deltaTime = timepassed;

            //*** removed, now evaluating lazily on demand inside cpupick
            //if (_SceneManager)
            //    _SceneManager.update(timepassed);

            pss = GetParticleSystems();
            if (pss)
                for (var i in pss) {
                    if (pss[i].update && pss[i].visible === true)
                        pss[i].update(timepassed || 0);
                }

            if (self.interpolateTransforms)
                self.setInterpolatedTransforms(timepassed);

            self.applyViewTransformOverrides(timepassed);

            cam.matrixWorldInverse.getInverse(cam.matrixWorld);

            _viewProjectionMatrix.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
            vp = _viewProjectionMatrix.transpose().toArray(temparray);

            if (!rootdiv)
                rootdiv = document.getElementById('index-vwf');

            wh = $('#index-vwf').height();
            ww = $('#index-vwf').width();
            minD = Math.min(ww, wh);
            if (minD < 100) return;


            vpargs[0] = vp.slice(0);
            vpargs[1] = wh;
            vpargs[2] = ww;


            self.trigger('prerender', vpargs);
            self.updateGlyphs(null, vp, wh, ww);
            if (window._SceneManager)
                _SceneManager.preRender(cam);
            var keys = Object.keys(Engine.models[0].model.nodes);
            for (var j = 0; j < keys.length; j++) {
                var i = keys[j];
                var node = Engine.models[0].model.nodes[i];
                if (node.private.bodies.prerender)
                    node.private.bodies.prerender.call(node, [timepassed]);
            }

            //the camera changes the view projection in the prerender call

            _viewProjectionMatrix.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
            vp = _viewProjectionMatrix.transpose().toArray(temparray);


            if (sceneNode.frameCount > 5) {

                sceneNode.frameCount = 0;

                self.trigger('pickStart');
                var newPick = ThreeJSPick.call(self, sceneNode, cam, ww, wh);

                var newPickId = newPick ? getPickObjectID.call(view, newPick.object) : view.state.sceneRootID;
                self.trigger('pickEnd');

                if (self.lastPickId != newPickId && self.lastEventData) {

                    if (self.lastPickId) {
                        view.kernel.dispatchEvent(self.lastPickId, "pointerOut", self.lastEventData.eventData, self.lastEventData.eventNodeData);

                    }

                    if (newPickId) {
                        view.kernel.dispatchEvent(newPickId, "pointerOver", self.lastEventData.eventData, self.lastEventData.eventNodeData);

                    }

                }

                self.lastPickId = newPickId;

                //be sure to return the pick to the pool so that it does not require GC
                if (self.lastPick)
                    self.lastPick.release();
                self.lastPick = newPick;
                if (view.lastEventData && (view.lastEventData.eventData[0].screenPosition[0] != oldMouseX || view.lastEventData.eventData[0].screenPosition[1] != oldMouseY)) {
                    oldMouseX = view.lastEventData.eventData[0].screenPosition[0];
                    oldMouseY = view.lastEventData.eventData[0].screenPosition[1];
                    hovering = false;
                } else if (self.lastEventData && self.mouseOverCanvas && !hovering && self.lastPick) {
                    var pickId = getPickObjectID.call(view, self.lastPick.object, false);
                    if (!pickId) {
                        pickId = view.state.sceneRootID;
                    }
                    view.kernel.dispatchEvent(pickId, "pointerHover", self.lastEventData.eventData, self.lastEventData.eventNodeData);
                    hovering = true;
                }

            }
            renderer.clear();

            //var far = cam.far;
            //var near = cam.near;


            _viewProjectionMatrix.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
            vp = _viewProjectionMatrix.transpose().toArray(temparray);
            vpargs[0] = vp.slice(0);

            self.trigger('postprerender', vpargs);


            //update the render passes - these may be added by render to texture materials, or from the terrain grass engine
            for (var i = 0; i < self.renderTargetPasses.length; i++) {
                var rttcamID = self.renderTargetPasses[i].camera;
                var rttcam = self.state.nodes[rttcamID].getRoot();
                var rtt = self.renderTargetPasses[i].target;
                renderer.setRenderTarget(rtt);
                renderer.clear(scene, rttcam, rtt);
                renderer.setRenderTarget();
                renderer.render(scene, rttcam, rtt);
            }


            //use this for drawing really really far. Not usually necessary
            //cam.near = cam.far - (cam.far - cam.near)/100.0;
            //cam.far = far * 10;
            //cam.updateProjectionMatrix();
            //renderer.render(scene,cam);
            //renderer.clear(false,true,false);
            //cam.near = near;
            //cam.far = far;
            //cam.updateProjectionMatrix();

            //only render effects in normal mode. Should our older stereo support move into a THREE.js effect?
            if (self.renderMode === NORMALRENDER) {
                if (cam.setViewOffset)
                    cam.setViewOffset(undefined);
                cam.updateProjectionMatrix();
                //if there are no effects, we can do a normal render
                if (self.effects.length == 0)
                    _RenderManager.render(scene, cam);
                else //else, the normal render is taken care of by the effect
                {
                    for (var i = 0; i < self.effects.length; i++) {
                        self.effects[i].render(scene, cam);
                    }
                }
            } else if (self.renderMode == VRRENDER) {

                if (cam.setViewOffset)
                    cam.setViewOffset(undefined);
                cam.updateProjectionMatrix();
                //if there are no effects, we can do a normal render
                if (self.effects.length == 0)
                    self.vrRenderer.render(scene, cam);
                else //else, the normal render is taken care of by the effect
                {
                    for (var i = 0; i < self.effects.length; i++) {
                        self.effects[i].render(scene, cam);
                    }
                }


            } else if (self.renderMode === STEREORENDER) {
                var width = $('#index-vwf').attr('width');
                var height = $('#index-vwf').attr('height');
                var ww2 = width / (2 * _dRenderer.devicePixelRatio);
                var h = ww2 / 1.333;
                var hdif = (height - h) / (2 * _dRenderer.devicePixelRatio * _dRenderer.devicePixelRatio * _dRenderer.devicePixelRatio);
                var centerh = hdif;

                oldaspect = cam.aspect;
                cam.aspect = 1.333;
                renderer.enableScissorTest(true);

                cam.fov = 60;
                cam.updateProjectionMatrix();
                var camX = new THREE.Vector3(cam.matrixWorld.elements[0], cam.matrixWorld.elements[1], cam.matrixWorld.elements[2]);
                camX.normalize();
                camX.setLength(.025);

                //go left
                cam.matrixWorld.elements[12] -= camX.x;
                cam.matrixWorld.elements[13] -= camX.y;
                cam.matrixWorld.elements[14] -= camX.z;

                renderer.setViewport(0, centerh, ww2, h);
                _dRenderer.setScissor(0, centerh, ww2, h);

                if (cam.setViewOffset)
                    cam.setViewOffset(ww2, h, -100, 0, ww2, h);
                cam.updateProjectionMatrix();

                if (cam.setViewOffset)
                    cam.setViewOffset(ww2, h, -_SettingsManager.getKey('stereoOffset') * ww2, 0, ww2, h);
                cam.updateProjectionMatrix();
                renderer.render(scene, cam);

                //go equally far right
                cam.matrixWorld.elements[12] += camX.x * 2;
                cam.matrixWorld.elements[13] += camX.y * 2;
                cam.matrixWorld.elements[14] += camX.z * 2;

                renderer.setViewport(ww2, centerh, ww2, h);
                _dRenderer.setScissor(ww2, centerh, ww2, h);

                if (cam.setViewOffset)
                    cam.setViewOffset(ww2, h, _SettingsManager.getKey('stereoOffset') * ww2, 0, ww2, h);
                cam.updateProjectionMatrix();

                renderer.render(scene, cam);

                //return to center
                cam.matrixWorld.elements[12] -= camX.x;
                cam.matrixWorld.elements[13] -= camX.y;
                cam.matrixWorld.elements[14] -= camX.z;
                _dRenderer.setViewport(0, 0, $('#index-vwf').attr('width'), $('#index-vwf').attr('height'));
                _dRenderer.setScissor(0, 0, $('#index-vwf').attr('width'), $('#index-vwf').attr('height'));
                renderer.enableScissorTest(false);


            }


            if (self.selection && Engine.getPropertyFast(self.selection.id, 'type') == 'Camera' && self.cameraID != self.selection.id) {
                var selnode = _Editor.findviewnode(self.selection.id);
                if (selnode) {
                    selcam = selnode.children[0];
                    oldaspect = selcam.aspect;
                    selcam.aspect = 1;
                    selcam.updateProjectionMatrix();

                    t = $('#toolbar').offset().top + $('#toolbar').height() + 10;
                    l = 10;
                    w = parseInt($('#index-vwf').attr('width') / 3);
                    h = parseInt($('#index-vwf').attr('height') / 3);

                    var dpr = _dRenderer.devicePixelRatio;
                    renderer.setViewport(0, 0, w / dpr, w / dpr);
                    _Editor.hideMoveGizmo();
                    _dRenderer.setScissor(0, 0, w / dpr, w / dpr);
                    renderer.enableScissorTest(true);


                    camback = self.cameraID;
                    self.cameraID = self.selection.id;


                    selcam.matrixWorldInverse.getInverse(selcam.matrixWorld);

                    _viewProjectionMatrix.multiplyMatrices(selcam.projectionMatrix, selcam.matrixWorldInverse);
                    insetvp = MATH.transposeMat4(_viewProjectionMatrix.toArray(temparray));


                    self.trigger('postprerender', [insetvp, w / dpr, w / dpr]);

                    renderer.clear(true, true, true);
                    renderer.render(scene, selcam);

                    self.cameraID = camback;
                    _Editor.showMoveGizmo();
                    _dRenderer.setViewport(0, 0, parseInt($('#index-vwf').attr('width')) / dpr, parseInt($('#index-vwf').attr('height')) / dpr);
                    _dRenderer.setScissor(0, 0, parseInt($('#index-vwf').attr('width')) / dpr, parseInt($('#index-vwf').attr('height')) / dpr);
                    renderer.enableScissorTest(false);
                    selcam.aspect = oldaspect;
                    selcam.updateProjectionMatrix();
                }

            }


            self.trigger('postrender', vpargs);

            if ($('#glyphOverlay').css('display') != 'none') {
                self.trigger('glyphRender', vpargs);
            }

            if (window._SceneManager)
                _SceneManager.postRender();

            if (stats.domElement.style.display == 'block')
                stats.update();

            if (self.interpolateTransforms)
                self.restoreTransforms();

            self.restoreViewTransformOverrides(timepassed);

            sceneNode.lastTime = now;
            self.inFrame = false;


            if (glext_ft) {
                glext_ft.frameTerminator();
            }

            self.trigger('postFrame');

        };

        var mycanvas = this.canvasQuery.get(0);


        if (mycanvas) {
            var oldMouseX = 0;
            var oldMouseY = 0;
            var hovering = false;
            var view = this;

            if (!_SettingsManager.settings.disableWebGL) {
                if (getURLParameter('disableWebGL') == 'null') {

                    var contextCreated = false;
                    try {
                        sceneNode.renderer = new THREE.WebGLRenderer({
                            canvas: mycanvas,
                            antialias: _SettingsManager.getKey('antialias'),
                            alpha: false,
                            stencil: false,
                            depth: true,
                            preserveDrawingBuffer: false,
                            devicePixelRatio: window.devicePixelRatio

                        });
                        contextCreated = true;
                    } catch (e) {


                        //lets not fall back on canvas renderer. there just is no point trying to do this without it.
                        //so, we create a renderer anyway.
                        //just throw out to a page. Could be a custom error warning. 
                        alertify.alert("We were unable to use WebGL on this device. Sandbox requires WebGL support for graphics. You can continue, but will see no 3D display.")


                    }
                    if (contextCreated)
                        sceneNode.renderer.context.canvas.addEventListener("webglcontextlost", function(event) {

                            alertify.error('WebGL Context Lost!');

                            //no point in rendering when we have no context
                            _dView.paused = true;

                            //clean up existing resources
                            var walk = function(node) {
                                if (node.children)
                                    for (var i = 0; i < node.children.length; i++)
                                        walk(node.children[i])
                                if (node.dispose)
                                    node.dispose();
                                if (node.__webglInit)
                                    node.__webglInit = undefined;
                                if (node.__webglActive)
                                    node.__webglActive = undefined;

                                if (node.geometryGroups)
                                    node.geometryGroups = undefined;

                                if (node.geometry)
                                    walk(node.geometry);
                                walk(_dScene);
                            }

                        }, false);

                    if (contextCreated)
                        sceneNode.renderer.context.canvas.addEventListener("webglcontextrestored", function(event) {
                            // Do something 
                            //chadwick :10/24/14
                            //try to recreate all the webgl stuff when context is restored.
                            //TODO: the terrain engine does all sorts of crazy things. Things that current probably don't work
                            //terrain   //nope, turns out this is fine
                            //render-to-texture
                            //videotextures   //seems ok, but does stop the vidoe
                            //the grass system  
                            //postprocessing
                            //buffergeometry - in progress
                            //any other code that manually manages rendertargets 

                            //ok, good to render next frame
                            _dView.paused = false;

                            //create a new renderer and set all pointers to it
                            renderer = _dRenderer = sceneNode.renderer = new THREE.WebGLRenderer({
                                canvas: mycanvas,
                                antialias: _SettingsManager.getKey('antialias'),
                                alpha: false,
                                stencil: false,
                                devicePixelRatio: window.devicePixelRatio
                            });
                            renderer.sortObjects = false;


                            //here, we are going to do a lot of work to clean up the three.js datastructures
                            //to force the  new renderer to recreate all the webgl objects
                            _dScene.__webglObjects = {};

                            //reset the renderer properties
                            sceneNode.renderer.shadowMapType = THREE.PCFSoftShadowMap;
                            sceneNode.renderer.shadowMapEnabled = true;
                            sceneNode.renderer.autoClear = false;
                            sceneNode.renderer.setClearColor({
                                r: 1,
                                g: 1,
                                b: 1
                            }, 1.0);

                            //because we can encounter the same objects over and over in the scenegraph, we need to keep track of what we hit
                            var geoProcessedList = [];
                            var matProcessedList = [];
                            var walk = function(node) {
                                    if (node.children)
                                        for (var i = 0; i < node.children.length; i++)
                                            walk(node.children[i])

                                    //mark objects an not inited
                                    if (node.__webglInit)
                                        node.__webglInit = undefined;
                                    if (node.__webglActive)
                                        node.__webglActive = undefined;


                                    //clear buffers and caches on geometries
                                    if (node instanceof THREE.Geometry && geoProcessedList.indexOf(node) == -1) {
                                        if (node.geometryGroups)
                                            node.geometryGroups = undefined;
                                        if (node.geometryGroupsList)
                                            node.geometryGroupsList = undefined;
                                        node.__colorArray = undefined;
                                        node.__sortArray = undefined;
                                        node.__vertexArray = undefined;
                                        node.__webglColorBuffer = undefined;
                                        node.__webglCustomAttributesList = undefined;
                                        node.__webglInit = undefined;
                                        node.__webglParticleCount = undefined;
                                        node.__webglVertexBuffer = undefined;
                                        geoProcessedList.push(node);
                                    }
                                    if (node instanceof THREE.BufferGeometry) {
                                        for (var i in node.attributes) {

                                            node.attributes[i].buffer = _dRenderer.context.createBuffer();


                                            node.attributes[i].array = setClone(node.attributes[i].array);
                                            _dRenderer.context.bindBuffer(_dRenderer.context.ARRAY_BUFFER, node.attributes[i].buffer);
                                            _dRenderer.context.bufferData(_dRenderer.context.ARRAY_BUFFER, node.attributes[i].array, _dRenderer.context.STATIC_DRAW);


                                        }
                                    }
                                    //send geometry into this same function
                                    if (node.geometry) {
                                        walk(node.geometry);

                                    }

                                    //have to be careful! renderer stashes the rendertarget in the light itself
                                    //clear it
                                    if (node instanceof THREE.Light) {
                                        if (node.shadowMap) {
                                            node.shadowMap.__webglFramebuffer = undefined;
                                            node.shadowMap.__webglRenderbuffer = undefined;
                                            node.shadowMap.__webglTexture = undefined;
                                        }

                                    }
                                    //careful! three.js uses a datatexture to send bone transforms. clear this texture
                                    if (node instanceof THREE.SkinnedMesh) {
                                        if (node.skeleton.boneTexture) {
                                            node.skeleton.boneTexture.needsUpdate = true
                                            node.skeleton.boneTexture.__webglInit = undefined;
                                            node.skeleton.boneTexture.__webglTexture = undefined;
                                        }
                                    }

                                    //scene needs to be tricked into re-initing the objects. this does that
                                    if (!(node instanceof THREE.Geometry))
                                        _dScene.__objectsAdded.push(node);

                                    //big step here, deal with materials
                                    if (node.material && matProcessedList.indexOf(node.material) == -1) {
                                        resetMaterial(node.material);
                                        matProcessedList.push(node.material);
                                    }

                                    //reset the default datatexture provided while real textures are loading
                                    var defaulttex = _SceneManager.getDefaultTexture();
                                    defaulttex.__webglInit = undefined;
                                    defaulttex.__webglTexture = undefined;
                                    defaulttex.needsUpdate = true;


                                    if (node.geometry)
                                        walk(node.geometry);
                                }
                                //walk the scenegraph and recreate
                            walk(_dScene);

                            alertify.log('WebGL Context Restored!');
                            glext_ft = _dRenderer.context.getExtension("GLI_frame_terminator");

                        }, false);

                    if (contextCreated) {
                        sceneNode.renderer.autoUpdateScene = false;
                        sceneNode.renderer.setViewport(0, 0, $('#index-vwf').width(), $('#index-vwf').height());

                        sceneNode.renderer.shadowMapType = THREE.PCFSoftShadowMap;
                        sceneNode.renderer.shadowMapEnabled = true;
                        sceneNode.renderer.autoClear = false;
                        sceneNode.renderer.setClearColor({
                            r: 1,
                            g: 1,
                            b: 1
                        }, 1.0);
                        if (sceneNode.renderer.setFaceCulling)
                            sceneNode.renderer.setFaceCulling(false);
                    }
                }

            }


            rebuildAllMaterials.call(this);

            this.state.cameraInUse = sceneNode.camera.threeJScameras[sceneNode.camera.ID];


            // Schedule the renderer.

            var view = this;
            var scene = sceneNode.threeScene;
            var backgroundScene = new THREE.Scene();

            var renderer = sceneNode.renderer;
            // by this point, the callback should be done. Create the renderer if the sensor was detected
            if (_dView.vrHMDSensor)
                _dView.vrRenderer = new THREE.VRRenderer(renderer, _dView.vrHMD);
            var scenenode = sceneNode;
            window._dScene = scene;
            window._dbackgroundScene = backgroundScene;
            window._dRenderer = renderer;
            window._RenderManager = new(require("vwf/view/threejs/SandboxRenderer"))(_dRenderer, mycanvas);
            if (renderer) {

                glext_ft = _dRenderer.context.getExtension("GLI_frame_terminator");
            }
            window._dSceneNode = sceneNode;
            sceneNode.frameCount = 0; // needed for estimating when we're pick-safe

            initInputEvents.call(this, mycanvas);
            renderScene((+new Date));
        }
    }


    // -- initInputEvents ------------------------------------------------------------------------


    function initInputEvents(canvas) {
        var sceneNode = this.state.scenes[this.state.sceneRootID],
            child;
        var sceneID = this.state.sceneRootID;
        var sceneView = this;

        var pointerDownID = undefined;
        var pointerOverID = undefined;
        var pointerPickID = undefined;
        var threeActualObj = undefined;

        var lastXPos = -1;
        var lastYPos = -1;
        var mouseRightDown = false;
        var mouseLeftDown = false;
        var mouseMiddleDown = false;
        var win = window;

        var container = document.getElementById("container");
        var sceneCanvas = canvas;


        var self = this;

        var getEventData = function(e, debug) {
            var returnData = {
                eventData: undefined,
                eventNodeData: undefined
            };
            var pickInfo = self.lastPick;
            pointerPickID = undefined;

            threeActualObj = pickInfo ? pickInfo.object : undefined;
            pointerPickID = pickInfo ? getPickObjectID.call(sceneView, pickInfo.object, debug) : undefined;
            var mouseButton = "left";
            switch (e.button) {
                case 2:
                    mouseButton = "right";
                    break;
                case 1:
                    mouseButton = "middle";
                    break;
                default:
                    mouseButton = "left";
                    break;
            };

            returnData.eventData = [{
                /*client: "123456789ABCDEFG", */
                button: mouseButton,
                clicks: 1,
                buttons: {
                    left: mouseLeftDown,
                    middle: mouseMiddleDown,
                    right: mouseRightDown,
                },
                modifiers: {
                    alt: e.altKey,
                    ctrl: e.ctrlKey,
                    shift: e.shiftKey,
                    meta: e.metaKey,
                },
                position: [mouseXPos.call(this, e) / sceneView.width, mouseYPos.call(this, e) / sceneView.height],
                screenPosition: [mouseXPos.call(this, e), mouseYPos.call(this, e)],
                worldPickRay: _Editor.GetWorldPickRay(e)
            }];


            var camera = self.getCamera(); //sceneView.state.cameraInUse;
            var worldCamPos, worldCamTrans, camInverse;
            if (camera) {
                worldCamTrans = new THREE.Vector3();
                worldCamTrans.setFromMatrixPosition(camera.matrixWorld);
                worldCamPos = [worldCamTrans.x, worldCamTrans.y, worldCamTrans.z];

            }

            returnData.eventNodeData = {
                "": [{
                    distance: pickInfo ? pickInfo.distance : undefined,
                    origin: pickInfo ? pickInfo.worldCamPos : undefined,
                    globalPosition: pickInfo ? [pickInfo.point.x, pickInfo.point.y, pickInfo.point.z] : undefined,
                    globalNormal: pickInfo ? [0, 0, 1] : undefined, //** not implemented by threejs
                    globalSource: worldCamPos,
                }]
            };

            if (pickInfo && pickInfo.normal) {
                var pin = pickInfo.normal;
                var nml = goog.vec.Vec3.createFloat32FromValues(pin[0], pin[1], pin[2]);
                nml = goog.vec.Vec3.normalize(nml, goog.vec.Vec3.create());
                returnData.eventNodeData[""][0].globalNormal = [nml[0], nml[1], nml[2]];
            }

            if (sceneView && sceneView.state.nodes[pointerPickID]) {
                var camera = sceneView.getCamera();
                var childID = pointerPickID;
                var child = sceneView.state.nodes[childID];
                var parentID = child.parentID;
                var parent = sceneView.state.nodes[child.parentID];
                var trans, parentTrans, localTrans, localNormal, parentInverse, relativeCamPos;
                returnData.eventNodeData[''][0].sourceID = pointerPickID;
                while (child) {

                    trans = goog.vec.Mat4.createFromArray(child.threeObject.matrix.elements);
                    goog.vec.Mat4.transpose(trans, trans);

                    if (parent) {
                        parentTrans = goog.vec.Mat4.createFromArray(parent.threeObject.matrix.elements);
                        goog.vec.Mat4.transpose(parentTrans, parentTrans);
                    } else {
                        parentTrans = undefined;
                    }

                    if (trans && parentTrans) {
                        // get the parent inverse, and multiply by the world
                        // transform to get the local transform 
                        parentInverse = goog.vec.Mat4.create();
                        if (goog.vec.Mat4.invert(parentTrans, parentInverse)) {
                            localTrans = goog.vec.Mat4.multMat(parentInverse, trans,
                                goog.vec.Mat4.create()
                            );
                        }
                    }

                    // transform the global normal into local
                    if (pickInfo && pickInfo.normal) {
                        localNormal = goog.vec.Mat4.multVec3Projective(trans, pickInfo.normal,
                            goog.vec.Vec3.create());
                    } else {
                        localNormal = undefined;
                    }

                    if (worldCamPos) {
                        relativeCamPos = goog.vec.Mat4.multVec3Projective(trans, worldCamPos,
                            goog.vec.Vec3.create());
                    } else {
                        relativeCamPos = undefined;
                    }

                    returnData.eventNodeData[childID] = [{
                        position: localTrans,
                        normal: localNormal,
                        source: relativeCamPos,
                        distance: pickInfo ? pickInfo.distance : undefined,
                        globalPosition: pickInfo ? pickInfo.coord : undefined,
                        globalNormal: pickInfo ? pickInfo.normal : undefined,
                        globalSource: worldCamPos,
                        sourceID: pointerPickID,
                    }];

                    childID = parentID;
                    child = sceneView.state.nodes[childID];
                    parentID = child ? child.parentID : undefined;
                    parent = parentID ? sceneView.state.nodes[child.parentID] : undefined;

                }
            }
            self.lastEventData = returnData;
            return returnData;
        }

        canvas.onmousedown = function(e) {

            if (disregardMouseInputsToSim()) return;

            switch (e.button) {
                case 2:
                    mouseRightDown = true;
                    break;
                case 1:
                    mouseMiddleDown = true;
                    break;
                case 0:
                    mouseLeftDown = true;
                    break;
            };

            e.preventDefault();

            var event = getEventData(e, false);
            if (event) {
                pointerDownID = pointerPickID ? pointerPickID : sceneID;
                sceneView.kernel.dispatchEvent(pointerDownID, "pointerDown", event.eventData, event.eventNodeData);
            }
        }

        canvas.onmouseup = function(e) {

            if (disregardMouseInputsToSim()) return;

            var ctrlDown = e.ctrlKey;
            var atlDown = e.altKey;
            var ctrlAndAltDown = ctrlDown && atlDown;

            switch (e.button) {
                case 2:
                    mouseRightDown = false;
                    break;
                case 1:
                    mouseMiddleDown = false;
                    break;
                case 0:
                    mouseLeftDown = false;
                    break;
            };

            e.preventDefault();

            var eData = getEventData(e, ctrlAndAltDown);
            if (eData) {
                var mouseUpObjectID = pointerPickID;
                if (mouseUpObjectID && pointerDownID && mouseUpObjectID == pointerDownID) {
                    sceneView.kernel.dispatchEvent(mouseUpObjectID, "pointerClick", eData.eventData, eData.eventNodeData);

                    // TODO: hierarchy output, helpful for setting up applications
                    //var obj3js = sceneView.state.nodes[mouseUpObjectID].threeObject;
                    //if ( obj3js ) {
                    //    if ( atlDown && !ctrlDown ) {
                    //        recurseGroup.call( sceneView, obj3js, 0 ); 
                    //    }
                    //}
                }
                if (pointerDownID)
                    sceneView.kernel.dispatchEvent(pointerDownID, "pointerUp", eData.eventData, eData.eventNodeData);
            }
            pointerDownID = undefined;
        }

        canvas.onmouseover = function(e) {
            if (disregardMouseInputsToSim()) return;
            self.mouseOverCanvas = true;
            var eData = getEventData(e, false);
            if (eData) {
                pointerOverID = pointerPickID ? pointerPickID : sceneID;
                sceneView.kernel.dispatchEvent(pointerOverID, "pointerEnter", eData.eventData, eData.eventNodeData);
            }
        }
        var lastpoll = performance.now();
        canvas.onmousemove = function(e) {



            //can we bail out of this before calling getEventData? this might have a small performance boost
            if (mouseLeftDown || mouseRightDown || mouseMiddleDown) {
                // lets begin filtering this - it should be possible to only send the data when the change is greater than some value
                if (pointerDownID) {

                    var now = performance.now();
                    var timediff = (now - lastpoll);
                    if (timediff < 50) //condition for filter
                    {
                        return;
                    }
                }
            }
            lastpoll = now;
            var eData = getEventData(e, false);

            if (disregardMouseInputsToSim()) return;
            if (eData) {
                if (mouseLeftDown || mouseRightDown || mouseMiddleDown) {
                    // lets begin filtering this - it should be possible to only send the data when the change is greater than some value
                    if (pointerDownID && pointerDownID != vwf.application()) { //don't allow sending of mouse motion on whole scene
                        //this is too much data, and can't be efficiently routed by the server since the scene is co-simulated



                        sceneView.lastData = eData;
                        sceneView.kernel.dispatchEvent(pointerDownID, "pointerMove", eData.eventData, eData.eventNodeData);


                    }
                } else {
                    if (pointerPickID) {
                        if (pointerOverID) {
                            if (pointerPickID != pointerOverID) {
                                if (pointerOverID)
                                    sceneView.kernel.dispatchEvent(pointerOverID, "pointerLeave", eData.eventData, eData.eventNodeData);
                                pointerOverID = pointerPickID;
                                if (pointerOverID)
                                    sceneView.kernel.dispatchEvent(pointerOverID, "pointerEnter", eData.eventData, eData.eventNodeData);
                            }
                        } else {
                            pointerOverID = pointerPickID;
                            if (pointerOverID)
                                sceneView.kernel.dispatchEvent(pointerOverID, "pointerEnter", eData.eventData, eData.eventNodeData);
                        }
                    } else {
                        if (pointerOverID) {
                            if (pointerOverID)
                                sceneView.kernel.dispatchEvent(pointerOverID, "pointerLeave", eData.eventData, eData.eventNodeData);
                            pointerOverID = undefined;
                        }
                    }
                }
            }
        }

        canvas.onmouseout = function(e) {
            if (disregardMouseInputsToSim()) return;
            if (pointerOverID) {
                sceneView.kernel.dispatchEvent(pointerOverID, "pointerLeave");
                pointerOverID = undefined;
            }
            self.mouseOverCanvas = false;
        }

        canvas.setAttribute("onmousewheel", '');

        window.document.getElementById('index-vwf').onkeydown = function(event) {

            var key = undefined;
            var validKey = false;
            var keyAlreadyDown = false;
            switch (event.keyCode) {
                case 17:
                case 16:
                case 18:
                case 19:
                case 20:
                    break;
                default:
                    key = getKeyValue.call(sceneView, event.keyCode);
                    keyAlreadyDown = !!sceneView.keyStates.keysDown[key.key];
                    sceneView.keyStates.keysDown[key.key] = key;
                    validKey = true;
                    break;
            }

            if (!sceneView.keyStates.mods) sceneView.keyStates.mods = {};
            sceneView.keyStates.mods.alt = event.altKey;
            sceneView.keyStates.mods.shift = event.shiftKey;
            sceneView.keyStates.mods.ctrl = event.ctrlKey;
            sceneView.keyStates.mods.meta = event.metaKey;
            sceneView.keyStates.key = key;
            var sceneNode = sceneView.state.scenes[sceneView.state.sceneRootID];
            if (validKey && sceneNode && !keyAlreadyDown /*&& Object.keys( sceneView.keyStates.keysDown ).length > 0*/ ) {
                //var params = JSON.stringify( sceneView.keyStates );

                sceneView.kernel.dispatchEvent(getClientFocusNode(Engine.moniker()), "keyDown", [sceneView.keyStates]);
            }
        };
        window.document.getElementById('index-vwf').onblur = function() {

            var sceneNode = sceneView.state.scenes[sceneView.state.sceneRootID];
            if (sceneNode) {
                for (var i in sceneView.keyStates.keysDown) {

                    var key = sceneView.keyStates.keysDown[i];
                    delete sceneView.keyStates.keysDown[i];
                    sceneView.keyStates.keysUp[key.key] = key;
                    sceneView.keyStates.key = key;
                    if (sceneNode) sceneView.kernel.dispatchEvent(getClientFocusNode(Engine.moniker()), "keyUp", [sceneView.keyStates]);
                }

                for (var i in sceneView.keyStates.keysUp) {

                    delete sceneView.keyStates.keysUp[i];

                }
            }

        }
        window.document.getElementById('index-vwf').onkeyup = function(event) {
            var key = undefined;
            var validKey = false;
            switch (event.keyCode) {
                case 16:
                case 17:
                case 18:
                case 19:
                case 20:
                    break;
                default:
                    key = getKeyValue.call(sceneView, event.keyCode);
                    delete sceneView.keyStates.keysDown[key.key];
                    sceneView.keyStates.keysUp[key.key] = key;
                    validKey = true;
                    break;
            }

            sceneView.keyStates.mods.alt = event.altKey;
            sceneView.keyStates.mods.shift = event.shiftKey;
            sceneView.keyStates.mods.ctrl = event.ctrlKey;
            sceneView.keyStates.mods.meta = event.metaKey;
            sceneView.keyStates.key = key;
            var sceneNode = sceneView.state.scenes[sceneView.state.sceneRootID];
            if (validKey && sceneNode) {
                //var params = JSON.stringify( sceneView.keyStates );
                sceneView.kernel.dispatchEvent(getClientFocusNode(Engine.moniker()), "keyUp", [sceneView.keyStates]);
                sceneView.kernel.dispatchEvent(getClientFocusNode(Engine.moniker()), "keyPress", [sceneView.keyStates]);
                delete sceneView.keyStates.keysUp[key.key];
            }

        };

        if (typeof canvas.onmousewheel == "function") {
            canvas.removeAttribute("onmousewheel");
            canvas.onmousewheel = function(e) {
                var eData = getEventData(e, false);
                if (eData) {
                    eData.eventNodeData[""][0].wheel = {
                        delta: e.wheelDelta / -40,
                        deltaX: e.wheelDeltaX / -40,
                        deltaY: e.wheelDeltaY / -40,
                    };
                    eData.eventData[0].wheelDelta = e.wheelDelta / -40;
                    eData.eventData[0].wheelDeltaX = e.wheelDeltaX / -40;
                    eData.eventData[0].wheelDeltaY = e.wheelDeltaY / -40;
                    var id = sceneID;
                    if (pointerDownID && mouseRightDown || mouseLeftDown || mouseMiddleDown)
                        id = pointerDownID;
                    else if (pointerOverID)
                        id = pointerOverID;
                    if (id)
                        sceneView.kernel.dispatchEvent(id, "pointerWheel", JSON.parse(JSON.stringify(eData.eventData)), JSON.parse(JSON.stringify(eData.eventNodeData)));
                    delete eData.eventData[0].wheelDelta;
                    delete eData.eventData[0].wheelDeltaY;
                    delete eData.eventData[0].wheelDeltaX;
                }
            };
        } else {
            canvas.removeAttribute("onmousewheel");
            canvas.addEventListener('DOMMouseScroll', function(e) {
                var eData = getEventData(e, false);
                if (eData) {
                    eData.eventNodeData[""][0].wheel = {
                        delta: e.detail,
                        deltaX: e.detail,
                        deltaY: e.detail,
                    };
                    eData.eventData[0].wheelDelta = e.detail;
                    eData.eventData[0].wheelDeltaX = e.detail;
                    eData.eventData[0].wheelDeltaY = e.detail;
                    var id = sceneID;
                    if (pointerDownID && mouseRightDown || mouseLeftDown || mouseMiddleDown)
                        id = pointerDownID;
                    else if (pointerOverID)
                        id = pointerOverID;

                    sceneView.kernel.dispatchEvent(id, "pointerWheel", JSON.parse(JSON.stringify(eData.eventData)), JSON.parse(JSON.stringify(eData.eventNodeData)));
                    delete eData.eventData[0].wheelDelta;
                    delete eData.eventData[0].wheelDeltaY;
                    delete eData.eventData[0].wheelDeltaX;
                }
            });
        }


        // == Draggable Content ========================================================================

        //        canvas.addEventListener( "dragenter", function( e ) {
        //            e.stopPropagation();
        //            e.preventDefault();             
        //        }, false );
        //        canvas.addEventListener( "dragexit", function( e ) {
        //            e.stopPropagation();
        //            e.preventDefault();             
        //        }, false );

        // -- dragOver ---------------------------------------------------------------------------------


        // -- drop ---------------------------------------------------------------------------------


    };

    function getClientFocusNode(client) {
        var clients = Engine.getProperty(Engine.application(), 'clients');
        if (clients && clients[client] && clients[client].focusID)
            return clients[client].focusID;
        else return Engine.application();


    }

    function mouseXPos(e) {

        return e.clientX - e.currentTarget.getClientRects()[0].left + (window.scrollX || 0);
    }

    function mouseYPos(e) {
        return e.clientY - e.currentTarget.getClientRects()[0].top + (window.scrollY || 0);
    }


    function ThreeJSPick(sceneNode, cam, SCREEN_WIDTH, SCREEN_HEIGHT) {
        if (!this.lastEventData) return;

        if (!this.pickOptionsAvatar) this.pickOptionsAvatar = {
            filter: function(o) {
                return !(o.isAvatar === true)
            }
        };
        if (!this.pickOptions) this.pickOptions = {};

        var threeCam = cam;
        if (!this.ray) this.ray = new THREE.Ray();
        if (!this.projector) this.projector = new THREE.Projector();
        if (!this.directionVector) this.directionVector = new THREE.Vector3();


        var x = (this.lastEventData.eventData[0].screenPosition[0] / SCREEN_WIDTH) * 2 - 1;
        var y = -(this.lastEventData.eventData[0].screenPosition[1] / SCREEN_HEIGHT) * 2 + 1;


        this.directionVector.set(x, y, .5);

        this.projector.unprojectVector(this.directionVector, threeCam);
        var pos = new THREE.Vector3();
        var pos2 = new THREE.Vector3();
        pos2.x = threeCam.matrixWorld.elements[12];
        pos2.y = threeCam.matrixWorld.elements[13];
        pos2.z = threeCam.matrixWorld.elements[14];
        pos.copy(pos2);
        this.directionVector.sub(pos);
        this.directionVector.normalize();


        var intersects;
        if (!sceneNode.threeScene.CPUPick || !_SceneManager) {
            this.ray.set(pos, this.directionVector);
            var caster = new THREE.Raycaster(pos, directionVector);
            intersects = caster.intersectObjects(sceneNode.threeScene.children, true);
            if (intersects.length) {
                // intersections are, by default, ordered by distance,
                // so we only care for the first one. The intersection
                // object holds the intersection point, the face that's
                // been "hit" by the ray, and the object to which that
                // face belongs. We only care for the object itself.
                var target = intersects[0].object;

                var ID = getPickObjectID.call(this, target);

                var found = intersects[0];
                var priority = -1;
                var dist = 0;

                for (var i = 0; i < intersects.length; i++) {
                    if (intersects[i].object.visible == true) {
                        if (intersects[i].object.PickPriority === undefined)
                            intersects[i].object.PickPriority = 0;
                        if (intersects[i].object.PickPriority > priority) {
                            found = intersects[i];
                            priority = intersects[i].object.PickPriority;
                        }
                    }
                }
                return found;


            }

        } else {


            if (Engine.models[0].model.nodes['index-vwf'].cameramode == 'FirstPerson')
                intersects = _SceneManager.CPUPick([pos.x, pos.y, pos.z], [this.directionVector.x, this.directionVector.y, this.directionVector.z], this.pickOptionsAvatar);
            else
                intersects = _SceneManager.CPUPick([pos.x, pos.y, pos.z], [this.directionVector.x, this.directionVector.y, this.directionVector.z], this.pickOptions);


            return intersects;
        }

    }

    function getPickObjectID(threeObject) {

        if (threeObject.vwfID)
            return threeObject.vwfID;
        else if (threeObject.parent)
            return getPickObjectID(threeObject.parent);
        return null;
    }

    function getKeyValue(keyCode) {
        var key = {
            key: undefined,
            code: keyCode,
            char: undefined
        };
        switch (keyCode) {
            case 8:
                key.key = "backspace";
                break;
            case 9:
                key.key = "tab";
                break;
            case 13:
                key.key = "enter";
                break;
            case 16:
                key.key = "shift";
                break;
            case 17:
                key.key = "ctrl";
                break;
            case 18:
                key = "alt";
                break;
            case 19:
                key.key = "pausebreak";
                break;
            case 20:
                key.key = "capslock";
                break;
            case 27:
                key.key = "escape";
                break;
            case 33:
                key.key = "pageup";
                break;
            case 34:
                key.key = "pagedown";
                break;
            case 35:
                key.key = "end";
                break;
            case 36:
                key.key = "home";
                break;
            case 37:
                key.key = "leftarrow";
                break;
            case 38:
                key.key = "uparrow";
                break;
            case 39:
                key.key = "rightarrow";
                break;
            case 40:
                key.key = "downarrow";
                break;
            case 45:
                key.key = "insert";
                break;
            case 46:
                key.key = "delete";
                break;
            case 48:
                key.key = "0";
                key.char = "0";
                break;
            case 49:
                key.key = "1";
                key.char = "1";
                break;
            case 50:
                key.key = "2";
                key.char = "2";
                break;
            case 51:
                key.key = "3";
                key.char = "3";
                break;
            case 52:
                key.key = "4";
                key.char = "4";
                break;
            case 53:
                key.key = "5";
                key.char = "5";
                break;
            case 54:
                key.key = "6";
                key.char = "6";
                break;
            case 55:
                key.key = "7";
                key.char = "7";
                break;
            case 56:
                key.key = "8";
                key.char = "8";
                break;
            case 57:
                key.key = "9";
                key.char = "9";
                break;
            case 65:
                key.key = "A";
                key.char = "A";
                break;
            case 66:
                key.key = "B";
                key.char = "B";
                break;
            case 67:
                key.key = "C";
                key.char = "C";
                break;
            case 68:
                key.key = "D";
                key.char = "D";
                break;
            case 69:
                key.key = "E";
                key.char = "E";
                break;
            case 70:
                key.key = "F";
                key.char = "F";
                break;
            case 71:
                key.key = "G";
                key.char = "G";
                break;
            case 72:
                key.key = "H";
                key.char = "H";
                break;
            case 73:
                key.key = "I";
                key.char = "I";
                break;
            case 74:
                key.key = "J";
                key.char = "J";
                break;
            case 75:
                key.key = "K";
                key.char = "K";
                break;
            case 76:
                key.key = "L";
                key.char = "L";
                break;
            case 77:
                key.key = "M";
                key.char = "M";
                break;
            case 78:
                key.key = "N";
                key.char = "N";
                break;
            case 79:
                key.key = "O";
                key.char = "O";
                break;
            case 80:
                key.key = "P";
                key.char = "P";
                break;
            case 81:
                key.key = "Q";
                key.char = "Q";
                break;
            case 82:
                key.key = "R";
                key.char = "R";
                break;
            case 83:
                key.key = "S";
                key.char = "S";
                break;
            case 84:
                key.key = "T";
                key.char = "T";
                break;
            case 85:
                key.key = "U";
                key.char = "U";
                break;
            case 86:
                key.key = "V";
                key.char = "V";
                break;
            case 87:
                key.key = "W";
                key.char = "W";
                break;
            case 88:
                key.key = "X";
                key.char = "X";
                break;
            case 89:
                key.key = "Y";
                key.char = "Y";
                break;
            case 90:
                key.key = "Z";
                key.char = "Z";
                break;
            case 91:
                key.key = "leftwindow";
                break;
            case 92:
                key.key = "rightwindow";
                break;
            case 93:
                key.key = "select";
                break;
            case 96:
                key.key = "numpad0";
                key.char = "0";
                break;
            case 97:
                key.key = "numpad1";
                key.char = "1";
                break;
            case 98:
                key.key = "numpad2";
                key.char = "2";
                break;
            case 99:
                key.key = "numpad3";
                key.char = "3";
                break;
            case 100:
                key.key = "numpad4";
                key.char = "4";
                break;
            case 101:
                key.key = "numpad5";
                key.char = "5";
                break;
            case 102:
                key.key = "numpad6";
                key.char = "6";
                break;
            case 103:
                key.key = "numpad7";
                key.char = "7";
                break;
            case 104:
                key.key = "numpad8";
                key.char = "8";
                break;
            case 105:
                key.key = "numpad9";
                key.char = "9";
                break;
            case 106:
                key.key = "multiply";
                key.char = "*";
                break;
            case 107:
                key.key = "add";
                key.char = "+";
                break;
            case 109:
                key.key = "subtract";
                key.char = "-";
                break;
            case 110:
                key.key = "decimalpoint";
                key.char = ".";
                break;
            case 111:
                key.key = "divide";
                key.char = "/";
                break;
            case 112:
                key.key = "f1";
                break;
            case 113:
                key.key = "f2";
                break;
            case 114:
                key.key = "f3";
                break;
            case 115:
                key.key = "f4";
                break;
            case 116:
                key.key = "f5";
                break;
            case 117:
                key.key = "f6";
                break;
            case 118:
                key.key = "f7";
                break;
            case 119:
                key.key = "f8";
                break;
            case 120:
                key.key = "f9";
                break;
            case 121:
                key.key = "f10";
                break;
            case 122:
                key.key = "f11";
                break;
            case 123:
                key.key = "f12";
                break;
            case 144:
                key.key = "numlock";
                break;
            case 145:
                key.key = "scrolllock";
                break;
            case 186:
                key.key = "semicolon";
                key.char = ";";
                break;
            case 187:
                key.key = "equal";
                key.char = "=";
                break;
            case 188:
                key.key = "comma";
                key.char = ",";
                break;
            case 189:
                key.key = "dash";
                key.char = "-";
                break;
            case 190:
                key.key = "period";
                key.char = ".";
                break;
            case 191:
                key.key = "forwardslash";
                key.char = "/";
                break;
            case 192:
                key.key = "graveaccent";
                break;
            case 219:
                key.key = "openbraket";
                key.char = "{";
                break;
            case 220:
                key.key = "backslash";
                key.char = "\\";
                break;
            case 221:
                key.key = "closebraket";
                key.char = "}";
                break;
            case 222:
                key.key = "singlequote";
                key.char = "'";
                break;
            case 32:
                key.key = "space";
                key.char = " ";
                break;
        }
        return key;
    }

});