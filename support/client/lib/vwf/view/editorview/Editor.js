function to3Vec(vec, two, three) {
    if (vec.length) return new THREE.Vector3(vec[0], vec[1], vec[2]);
    else return new THREE.Vector3(vec, two, three);
}

function FindMaxMin(positions) {
    var min = [Infinity, Infinity, Infinity];
    var max = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i < positions.length - 2; i += 3) {
        var vert = [positions[i], positions[i + 1], positions[i + 2]];
        if (vert[0] > max[0]) max[0] = vert[0];
        if (vert[1] > max[1]) max[1] = vert[1];
        if (vert[2] > max[2]) max[2] = vert[2];
        if (vert[0] < min[0]) min[0] = vert[0];
        if (vert[1] < min[1]) min[1] = vert[1];
        if (vert[2] < min[2]) min[2] = vert[2];
    }
    return [min, max];
}

function sign(x) {
    if (x >= 0) return 1;
    else return -1;
}

//function to check the intersection of two divs
function hitTest(a, b){
var aPos = a.position();
var bPos = b.position();

var aLeft = aPos.left;
var aRight = aPos.left + a.width();
var aTop = aPos.top;
var aBottom = aPos.top + a.height();

var bLeft = bPos.left;
var bRight = bPos.left + b.width();
var bTop = bPos.top;
var bBottom = bPos.top + b.height();

// http://tekpool.wordpress.com/2006/10/11/rectangle-intersection-determine-if-two-given-rectangles-intersect-each-other-or-not/
return !( bLeft > aRight
    || bRight < aLeft
    || bTop > aBottom
    || bBottom < aTop
    );
}

var blueBoundingBoxMaterial = new THREE.LineBasicMaterial();
var redBoundingBoxMaterial = new THREE.LineBasicMaterial();
var greenBoundingBoxMaterial = new THREE.LineBasicMaterial();
var lightgreenBoundingBoxMaterial = new THREE.LineBasicMaterial();




    blueBoundingBoxMaterial.transparent = true;
    blueBoundingBoxMaterial.depthTest = false;
    blueBoundingBoxMaterial.depthWrite = false;
    blueBoundingBoxMaterial.color.r = 0;
    blueBoundingBoxMaterial.color.g = 0;
    blueBoundingBoxMaterial.color.b = 1;

    redBoundingBoxMaterial.transparent = true;
    redBoundingBoxMaterial.depthTest = false;
    redBoundingBoxMaterial.depthWrite = false;
    redBoundingBoxMaterial.color.r = 1;
    redBoundingBoxMaterial.color.g = 0;
    redBoundingBoxMaterial.color.b = 0;

    greenBoundingBoxMaterial.transparent = true;
    greenBoundingBoxMaterial.depthTest = false;
    greenBoundingBoxMaterial.depthWrite = false;
    greenBoundingBoxMaterial.color.r = 0;
    greenBoundingBoxMaterial.color.g = 1;
    greenBoundingBoxMaterial.color.b = 0;

    lightgreenBoundingBoxMaterial.transparent = true;
    lightgreenBoundingBoxMaterial.depthTest = false;
    lightgreenBoundingBoxMaterial.depthWrite = false;
    lightgreenBoundingBoxMaterial.color.r = 0;
    lightgreenBoundingBoxMaterial.color.g = .7;
    lightgreenBoundingBoxMaterial.color.b = .7;

define(["vwf/view/editorview/log", "vwf/view/editorview/progressbar", "vwf/view/editorview/angular-app","vwf/view/editorview/transformTool"], function(Log, ProgressBar, angularapp,transformTool) {
    var originalGizmoPos;
    var Editor = {};
    var isInitialized = false;
    return {
        getSingleton: function() {
            if (!isInitialized) {
                initialize.call(Editor);
                isInitialized = true;
            }
            return Editor;
        }
    }

    function initialize() {
        var self = this;

        var SelectedVWFNodes = [];
        var MoveGizmo = null;
        var WorldMouseDownPoint = null;
        var SelectMode = 'None';
        var ClickOffset = null;
        var Move = 0;
        var Rotate = 1;
        var Scale = 2;
        var Multi = 3;
        this.GizmoMode = Move;
        var oldintersectxy = [];
        var oldintersectxz = [];
        var oldintersectyz = [];
        this.mouseDownScreenPoint = [0, 0];
        this.mouseUpScreenPoint = [0, 0];
        this.selectionMarquee = null;
        var WorldCoords = 0;
        var LocalCoords = 1;
        var ParentCoords = 2;
        var CoordSystem = WorldCoords;
        var NewSelect = 0;
        var Add = 2;
        var Subtract = 3;
        this.PickMod = NewSelect;
        var WorldZ = [0, 0, 1];
        var WorldY = [0, 1, 0];
        var WorldX = [1, 0, 0];
        var CurrentZ = [0, 0, 1];
        var CurrentY = [0, 1, 0];
        var CurrentX = [1, 0, 0];
        var RotateSnap = 5 * 0.0174532925;
        var MoveSnap = .25;
        var ScaleSnap = .15;
        var oldxrot = 0;
        var oldyrot = 0;
        var oldzrot = 0;
        var SelectionBounds = [];
        var lastscale = [];
        var lastpos = [];
        var OldX = 0;
        var OldY = 0;
        var MouseMoved = false;

        this.TempPickCallback = null;
        this.translationPropertyName = 'translation';
        this.transformPropertyName = 'worldTransform';
        this.scalePropertyName = 'scale';

        var instanceData = _DataManager.getInstanceData() || {};

        var needTools = _EditorView.needTools();

        if (needTools) {
            $('#statusbar').css('display', 'block');

            $('#playButton').click(function() {
                if(window._Publisher)
                _Publisher.playWorld();
            });
            $('#pauseButton').click(function() {
                if(window._Publisher)
                _Publisher.togglePauseWorld();
            });
            $('#stopButton').click(function() {
                if(window._Publisher)
                _Publisher.stopWorld();
            });

            $('#stopButton').tooltip({
                content: "Click Stop to Edit",
                items: 'div'
            })
            $('#playButton').tooltip({
                content: "Click Play to Test",
                items: 'div'
            })


        }
        //create progressbar and the log bar
        ProgressBar.initialize('statusbarinner');
        window._ProgressBar = ProgressBar;

        Log.initialize('statusbar');
        window._Log = Log;

        var _CopiedNodes = [];
        //	$('#vwf-root').mousedown(function(e){
        this.mousedown_Gizmo = function(e) {


            this.undoPoint = null; //when the mouse is down, we start over with the record for the undo
            $('#index-vwf').focus();
            $('#ContextMenu').hide();
            $('#ContextMenu').css('z-index', '-1');
            MouseMoved = false;
            this.mouseDownScreenPoint = [e.clientX, e.clientY];
            if (MoveGizmo && e.button == 0) {

                this.saveTransforms();
                MoveGizmo.mouseDown(e);

                if (MoveGizmo.getAxis() == -1 && SelectMode == 'Pick') {
                    this.MouseLeftDown = true;

                    this.selectionMarquee.css('left', this.mouseDownScreenPoint[0]);
                    this.selectionMarquee.css('top', this.mouseDownScreenPoint[1]);
                    this.selectionMarquee.css('width', '0');
                    this.selectionMarquee.css('height', '0');
                    this.selectionMarquee.css('border', '2px dotted darkslategray');
                    this.selectionMarquee.css('pointer-events', 'all');
                }


            }
        }.bind(this);
        this.GetUniqueName = function(newname, addcount) {
            if (!addcount) addcount = 0;
            if (!newname) newname = 'Object';
            newname = newname.replace(/[0-9]*$/g, "");
            var nodes = Engine.models.object.objects;
            var count = 1 + addcount;
            for (var i in nodes) {
                var thisname = Engine.getProperty(nodes[i].id, 'DisplayName') || '';
                thisname = thisname.replace(/[0-9]*$/g, "");
                if (thisname == newname) count++;
            }
            return newname + count;
        }
        this.ThreeJSPick = function(campos, ray, options) {
            //	var now = performance.now();
            var ret1 = _SceneManager.CPUPick(campos, ray, options);
            //	var time1 = performance.now() - now;
            //	now = performance.now();
            //	var ret2 = this.findscene().CPUPick(campos,ray,options);
            //	var time2 = performance.now() - now;
            //	if(ret2 && ret1 && ret1.object !=  ret2.object)
            //		console.log('Error! New pick give different results!!!');
            //	console.log("New Time: " + time1,"Old Time: " + time2);
            return ret1;
        }
        this.ShowContextMenu = function(e) {

            e.preventDefault();
            e.stopPropagation();
            var ray = this.GetWorldPickRay(e);
            var campos = this.getCameraPosition();
            var pickopts = new THREE.CPUPickOptions();
            pickopts.OneHitPerMesh = true;

            var pick = this.ThreeJSPick(campos, ray, {
                OneHitPerMesh: false, ignore:[this.GetMoveGizmo().getGizmoBody()]
            });

            var vwfnode;
            while (pick && pick.object && !pick.object.vwfID) pick.object = pick.object.parent;
            if (pick && pick.object) vwfnode = pick.object.vwfID;

            var selected = self.isSelected(vwfnode);
            var testnode = vwfnode;
            while(!selected && testnode)
            {
                testnode = Engine.parent(testnode);
                selected = self.isSelected(testnode);

            }
            if(selected)
            vwfnode = testnode;
            if (selected) {
                $('#ContextMenuCopy').show();
                $('#ContextMenuDelete').show();
                $('#ContextMenuFocus').show();
                $('#ContextMenuDuplicate').show();
                $('#ContextMenuSelect').hide();
                $('#ContextMenuSelectNone').show();
            } else {
                $('#ContextMenuCopy').hide();
                $('#ContextMenuDelete').hide();
                $('#ContextMenuFocus').hide();
                $('#ContextMenuDuplicate').hide();
                $('#ContextMenuSelectNone').hide();
                if (vwfnode) {
                    $('#ContextMenuSelect').show();
                }
            }
            var dispName;
            if (vwfnode) dispName = Engine.getProperty(vwfnode, 'DisplayName');
            if (!dispName) dispName = vwfnode;
            $('#ContextMenuName').html((dispName || vwfnode || "{none selected}").escape());
            $('#ContextMenuName').attr('VWFID', vwfnode);
            $('#ContextMenu').show();
            _RenderManager.flashHilight(findviewnode(vwfnode));
            $('#ContextMenu').css('z-index', '1000000');
            $('#ContextMenu').css('left', e.clientX + 'px');
            $('#ContextMenu').css('top', e.clientY + 'px');
            this.ContextShowEvent = e;
            $('#ContextMenuActions').empty();
            if (vwfnode) {
                var actions = Engine.getMethods(vwfnode);
                for (var i in actions) {
                    if (actions[i].parameters.length == 0) {
                        $('#ContextMenuActions').append('<div id="Action' + i + '" class="ContextMenuAction">' + i + '</div>');
                        $('#Action' + i).attr('EventName', i);
                        $('#Action' + i).click(function() {
                            $('#ContextMenu').hide();
                            $('#ContextMenu').css('z-index', '-1');
                            $(".ddsmoothmenu").find('li').trigger('mouseleave');
                            $('#index-vwf').focus();
                            vwf_view.kernel.callMethod(vwfnode, $(this).attr('EventName'));
                        });
                    }
                }
            }
        }
        this.mouseleave = function(e) {

            //if the mouse is over anythign that is not the context menu, hide the context menu
            var teste = e.toElement || e.relatedTarget;
            if (teste != $('#ContextMenu')[0] && $(teste).parent()[0] != $('#ContextMenu')[0] && !$(teste).hasClass('glyph')) {
                $('#ContextMenu').hide();
                $('#ContextMenu').css('z-index', '-1');
            }

            //if the mouse is over any div that is not a selection glyph or the selection marquee, cancel all actions
            if ((!$(teste).hasClass('glyph') && !$(teste).hasClass('nametag') && !$(teste).hasClass('ignoreMouseout')) && teste !== this.selectionMarquee[0]) {
                this.undoPoint = null;
                this.MouseLeftDown = false;
                this.mouseDownScreenPoint = null;
                this.MouseLeftDown = false;
                this.selectionMarquee.css('border', 'none');
                this.selectionMarquee.css('pointer-events', 'none');
                this.mouseUpScreenPoint = [e.clientX, e.clientY];
                this.MoveGizmo.mouseLeave();
            }
        }
        this.restoreTransforms = function() {

            for (var s = 0; s < SelectedVWFNodes.length; s++) {
                this.setProperty(SelectedVWFNodes[s].id, 'transform', this.backupTransfroms[s]);
            }

        }
        this.saveTransforms = function() {

            for (var s = 0; s < SelectedVWFNodes.length; s++) {
                this.backupTransfroms[s] = Engine.getProperty(SelectedVWFNodes[s].id, 'transform');
            }

        }
       this.mouseDownSelectFilter = function(pickID)
        {
            //not sure this logic makes sense when more than one thing selected

            if (this.getSelectionCount() > 1 &&
            Engine.decendants(Engine.ancestors(_Editor.GetSelectedVWFID())[Engine.ancestors(_Editor.GetSelectedVWFID()).length-2] || _Editor.GetSelectedVWFID()).indexOf(pickID) == -1)
            {
                return Engine.ancestors(pickID)[Engine.ancestors(pickID).length-2] || pickID;
            }

            if(this.getSelectionCount() > 1) return pickID;
            var ancestors = Engine.ancestors(pickID);
            // this is a 2nd level object, so just return it
            if(ancestors.length < 2)
                return pickID;
            var sceneroot = ancestors[ancestors.length-2];
            var decendants = Engine.decendants(sceneroot);

            if(decendants.indexOf(this.GetSelectedVWFID()) > -1)
            {
                //the currently selected object is in the decendants
                return pickID;
            }
            if(this.GetSelectedVWFID() == pickID)
            {
                return pickID;
            }
            if(this.GetSelectedVWFID() == sceneroot)
            {
                return pickID;
            }
            return sceneroot;

        }
        this.dblclick_Gizmo = function(e)
        {
          /* window.setTimeout(function()
           {
            if(_Editor.GetSelectedVWFID() && !_PrimitiveEditor.isOpen())
                _PrimitiveEditor.show();
            if(_Editor.GetSelectedVWFID() && _PrimitiveEditor.isOpen())
                _SidePanel.showPanel();
            },20)

             this.mouseup(e);*/
        }
        this.mouseup_Gizmo = function(e) {

            //tracking for double click
            if(performance.now() - this.mouseUpTime  < 300 && e.button == 0)
            {
                this.mouseUpTime = 0;
                this.dblclick_Gizmo(e)
                return;
            }
            if (e.button == 2 && !MouseMoved && MoveGizmo.getAxis() == -1) {

                self.ShowContextMenu(e);
                this.undoPoint = null;
                return false;
            }
            if (e.button == 2 && MoveGizmo.getAxis() != -1) {
                this.undoPoint = null;
                this.restoreTransforms();
                MoveGizmo.setAxis(-1);
                this.mouseDownScreenPoint = null;
                return false;
            }


            this.MouseLeftDown = false;
            this.mouseUpTime = performance.now();

            this.mouseUpScreenPoint = [e.clientX, e.clientY];

            if (MoveGizmo.getAxis() == -1 && e.button == 0) {
                if (SelectMode == 'Pick' && this.mouseDownScreenPoint) {
                    var w = this.mouseUpScreenPoint[0] - this.mouseDownScreenPoint[0];
                    var h = this.mouseUpScreenPoint[1] - this.mouseDownScreenPoint[1];
                    var picksize = Math.sqrt(w * w + h * h);
                    if (picksize < 10) {
                        if (Engine.views[0].lastPickId && Engine.views[0].lastPickId != 'index-vwf') {
                            //implement some logic on the pick - select top level node, unless the current selection is
                            // in the hierarchy of the new selection
                            var newselection = Engine.views[0].lastPickId;

                            newselection = this.mouseDownSelectFilter(newselection);
                            this.SelectObject(_Editor.getNode(newselection), this.PickMod);
                        } else {
                            this.SelectObject(null);
                        }
                    } else {
                        //use this to filter out mouse ups that happen when dragging a slider over into the scene


                        //lets construct a screenspace rect of the selection region
                        var top = this.mouseDownScreenPoint[1];
                        var left = this.mouseDownScreenPoint[0]
                        var bottom = this.mouseUpScreenPoint[1];
                        var right = this.mouseUpScreenPoint[0];
                        if (h < 0) {
                            top = top + h;
                            bottom = top + -h;
                        }
                        if (w < 0) {
                            left = left + w;
                            right = left + -w;
                        }
                        var TopLeftRay = this.GetWorldPickRay({
                            clientX: left,
                            clientY: top
                        });
                        var TopRightRay = this.GetWorldPickRay({
                            clientX: right,
                            clientY: top
                        });
                        var BottomLeftRay = this.GetWorldPickRay({
                            clientX: left,
                            clientY: bottom
                        });
                        var BottomRighttRay = this.GetWorldPickRay({
                            clientX: right,
                            clientY: bottom
                        });

                        //now we build a frustum from the screenspace rect and the camera
                        var campos = this.getCameraPosition();
                        var ntl = MATH.addVec3(campos, TopLeftRay);
                        var ntr = MATH.addVec3(campos, TopRightRay);
                        var nbl = MATH.addVec3(campos, BottomLeftRay);
                        var nbr = MATH.addVec3(campos, BottomRighttRay);
                        var ftl = MATH.addVec3(campos, MATH.scaleVec3(TopLeftRay, 10000));
                        var ftr = MATH.addVec3(campos, MATH.scaleVec3(TopRightRay, 10000));
                        var fbl = MATH.addVec3(campos, MATH.scaleVec3(BottomLeftRay, 10000));
                        var fbr = MATH.addVec3(campos, MATH.scaleVec3(BottomRighttRay, 10000));
                        var frustrum = new Frustrum(ntl, ntr, nbl, nbr, ftl, ftr, fbl, fbr);

                        //get all the objects intersected
                        var hits = _SceneManager.FrustrumCast(frustrum, {
                            OneHitPerMesh: true
                        });
                        var vwfhits = [];
                        for (var i = 0; i < hits.length; i++) {
                            var vwfnode;
                            while (hits[i] && hits[i].object && !hits[i].object.vwfID) hits[i].object = hits[i].object.parent;
                            if (hits[i] && hits[i].object) vwfnode = hits[i].object.vwfID;

                            vwfnode = this.mouseDownSelectFilter(vwfnode);

                            if (vwfhits.indexOf(vwfnode) == -1 && vwfnode) vwfhits.push(vwfnode);

                            hits[i].release();
                        }
                        //now to find all glyphs intersected
                        //be sure not to allow select of scene this way
                        {
                            var glyphs = $('.glyph');
                            for(var i = 0; i < glyphs.length; i++)
                            {

                                if(hitTest( $(this.selectionMarquee),$(glyphs[i])))
                                {
                                    if($(glyphs[i]).attr('vwfid') !== Engine.application())
                                        vwfhits.push($(glyphs[i]).attr('vwfid'));
                                }
                            }

                        }
                        this.SelectObject(vwfhits, this.PickMod);

                    }

                    e.stopPropagation();
                }
                if (SelectMode == 'TempPick') {
                    if (this.TempPickCallback) this.TempPickCallback(_Editor.getNode(Engine.views[0].lastPickId));
                    e.stopPropagation();
                }
                if (SelectMode == 'PointPick') {
                    if (this.TempPickCallback) {
                        var ray;
                        var campos = this.getCameraPosition();
                        ray = this.GetWorldPickRay(e);

                        var pick = this.ThreeJSPick(campos, ray, {
                            filter: function(o) {
                                return !(o.isAvatar === true)
                            },ignore:[self.GetMoveGizmo().getGizmoBody()]
                        });

                        var dxy = pick.distance;
                        newintersectxy = MATH.addVec3(campos, MATH.scaleVec3(ray, dxy * .99));
                        var dxy2 = this.intersectLinePlane(ray, campos, [0, 0, 0], [0, 0, 1]);
                        var newintersectxy2 = MATH.addVec3(campos, MATH.scaleVec3(ray, dxy2));
                        newintersectxy2[2] += .01;
                        if (newintersectxy2[2] > newintersectxy[2]) newintersectxy = newintersectxy2;
                        this.TempPickCallback(newintersectxy);
                        this.TempPickCallback = null;
                        this.SelectObject();
                    }


                    e.stopPropagation();
                }

            }

            this.selectionMarquee.css('border', 'none');
            this.selectionMarquee.css('pointer-events', 'none');

            if (MoveGizmo.getAxis() != -1 && this.undoPoint) {
                for (var i = 0; i < SelectedVWFNodes.length; i++)
                    this.undoPoint.list[i].val = Engine.getProperty(SelectedVWFNodes[i].id, 'transform');
                _UndoManager.pushEvent(this.undoPoint);
                this.undoPoint = null;
            }else if(MoveGizmo.getAxis() != -1)
            {
                MoveGizmo.mouseUp(e);
            }

            if (MoveGizmo.getAxis() == 15) {
                this.SetCoordSystem(CoordSystem == WorldCoords ? LocalCoords : WorldCoords);
                this.updateGizmoOrientation(true);
            }

            this.mouseDownScreenPoint = null;
        }.bind(this);
        this.GetAllLeafMeshes = function(threeObject, list) {
            if (threeObject instanceof THREE.Mesh) {
                list.push(threeObject);
            }
            if (threeObject.children) {
                for (var i = 0; i < threeObject.children.length; i++) {
                    this.GetAllLeafMeshes(threeObject.children[i], list);
                }
            }
        }
        this.PickPoint = function(func) {

            SelectMode = 'PointPick';
            this.TempPickCallback = func;
        }
        this.FrustrumCast = function(frustrum) {
            var scene = this.findscene();
            return scene.FrustrumCast(frustrum);
            // var meshes = [];
            // var hits = [];
            // this.GetAllLeafMeshes(scene,meshes);
            // for(var i =0; i < meshes.length; i++)
            // {
            // var mat = MATH.inverseMat4(MATH.transposeMat4(meshes[i].matrixWorld.elements));
            // var tfrustrum = frustrum.transformBy(mat);
            // if(tfrustrum.intersectsObject(meshes[i].geometry))
            // hits.push({object:meshes[i]});
            // }
            // return hits;
        }
        this.DeleteSelection = function() {
            if (_UserManager.GetCurrentUserName() == null) {
                _Notifier.notify('You must log in to participate');
                return;
            }
            _UndoManager.startCompoundEvent();
            for (var s = 0; s < SelectedVWFNodes.length; s++) {

                var owner = Engine.getProperty(SelectedVWFNodes[s].id, 'owner');
                if (_PermissionsManager.getPermission(_UserManager.GetCurrentUserName(), SelectedVWFNodes[s].id) == 0) {
                    _Notifier.notify('You do not have permission to delete this object');
                    continue;
                }
                if (Engine.prototype(SelectedVWFNodes[s].id) == 'character-vwf') {
                    _Notifier.alert('Avatars cannot be deleted');
                    continue;
                }
                if (SelectedVWFNodes[s].id == Engine.application()) {
                    _Notifier.alert('The root scene cannot be deleted');
                    continue;
                }
                if (SelectedVWFNodes[s]) {

                    _UndoManager.recordDelete(SelectedVWFNodes[s].id);
                    vwf_view.kernel.deleteNode(SelectedVWFNodes[s].id);
                    $('#StatusSelectedID').html(('No Selection').escape());
                    $('#StatusSelectedName').html(('No Selection').escape());
                    $('#StatusPickMode').html(('Pick: None').escape());

                }
                if (_PrimitiveEditor.isOpen()) _PrimitiveEditor.hide();
                if (_SidePanel.isTabOpen('materialEditor')) _SidePanel.hideTab('materialEditor');
                if (_ScriptEditor.isOpen()) _ScriptEditor.hide();
            }
            _UndoManager.stopCompoundEvent();
            this.SelectObject(null);
        }.bind(this);
        //	$('#vwf-root').keyup(function(e){
        this.keyup_Gizmo = function(e) {

            if (_Editor.disableDueToWorldState()) return;
            if (e.keyCode == 17) {
                this.PickMod = NewSelect;
                console.log(this.PickMod);
                $('#index-vwf').css('cursor', 'default');
            }
            if (e.keyCode == 18) {
                this.PickMod = NewSelect;
                console.log(this.PickMod);
                $('#index-vwf').css('cursor', 'default');
            }
        }.bind(this);
        this.blur = function() {
            // we need to let the event propagate, then check that the new focused element is not a glyph.
            //if it is a glyph, focus back on the canvas
            var self = this;
            setTimeout(function(){
                if($(document.activeElement).hasClass('glyph')) return; // This is the element that has focus
                console.log(self.PickMod);
                self.PickMod = NewSelect;
                $('#index-vwf').css('cursor', 'default');
            },10);
        }
        this.keydown_Gizmo = function(e) {
            if (_Editor.disableDueToWorldState()) return;
            if (e.keyCode == 17) {
                this.PickMod = Add;
                console.log(this.PickMod);
                $('#index-vwf').css('cursor', 'all-scroll');
            }
            if (e.keyCode == 18) {
                this.PickMod = Subtract;
                console.log(this.PickMod);
                $('#index-vwf').css('cursor', 'not-allowed');
            }
            if (e.keyCode == 87 && SelectMode == 'Pick') {

                this.SetGizmoMode(Move);
            }
            if (e.keyCode == 69 && SelectMode == 'Pick') {

                this.SetGizmoMode(Rotate);
            }
            if (e.keyCode == 82 && SelectMode == 'Pick') {

                this.SetGizmoMode(Scale);
            }
            if (e.keyCode == 84 && SelectMode == 'Pick') {
                this.SetGizmoMode(Multi);
            }
            if (e.keyCode == 81) {
                this.SetSelectMode('Pick');
            }
            if (e.keyCode == 46) {
                this.DeleteSelection();
            }
            if (e.keyCode == 68 && e.shiftKey) {
                this.Duplicate();
            }
            if (e.keyCode == 67 && e.ctrlKey) {
                this.Copy();
            }
            if (e.keyCode == 86 && e.ctrlKey) {
                this.Paste();
            }
            if (e.keyCode == 90 && e.ctrlKey) {
                _UndoManager.undo();
            }
            if (e.keyCode == 89 && e.ctrlKey) {
                _UndoManager.redo();
            }
            if (e.keyCode == 83 && e.ctrlKey) {
                _DataManager.saveToServer();
                e.preventDefault();
            }
            if (e.keyCode == 48 && e.ctrlKey) {
                if(window._Publisher)
                _Publisher.testPublish();
                e.preventDefault();
                return false;
            }
            if (e.keyCode == 57 && e.ctrlKey) {
                if(window._Publisher)
                _Publisher.show();
                e.preventDefault();
                return false;
            }
        }.bind(this);
        this.NotifyPeersOfSelection = function() {

                var ids = [];
                for (var i = 0; i < SelectedVWFNodes.length; i++)
                    ids.push(SelectedVWFNodes[i].id);

                vwf_view.kernel.callMethod('index-vwf', 'PeerSelection', [ids]);

            }
            //remove all the peer selection gizmos
        this.hidePeerSelections = function() {
            for (var i in this.peerSelections) {
                var peerselection = this.peerSelections[i];
                for (var i = 0; i < peerselection.bounds.length; i++) {
                    var bound = peerselection.bounds[i];
                    if (bound) {
                        bound.parent.remove(bound);

                        bound.children[0].geometry.dispose();
                    }
                }
            }
            this.peerSelections = {};
        }
        this.calledMethod = function(id, method, args) {
            //we're being notified that a peer has selected an object
            if (method == 'PeerSelection') {
                if (Engine.client() != Engine.moniker()) {
                    var ids = args[0];
                    //why does this happen?
                    if (!ids) {
                        return;
                    }
                    if (!this.peerSelections)
                        this.peerSelections = {};
                    if (!this.peerSelections[Engine.client()]) {
                        this.peerSelections[Engine.client()] = {
                            color: new THREE.Color(),
                            nodes: [],
                            bounds: []
                        };
                    }
                    var peerselection = this.peerSelections[Engine.client()];
                    for (var i = 0; i < peerselection.bounds.length; i++) {
                        var bound = peerselection.bounds[i];
                        if (bound) {
                            bound.parent.remove(bound);
                            bound.children[0].geometry.dispose();
                        }
                    }
                    peerselection.bounds = [];
                    peerselection.nodes = [];
                    peerselection.nodes = ids;
                    for (var i = 0; i < peerselection.nodes.length; i++) {
                        var boundingbox = this.createBoundingBox(peerselection.nodes[i]);
                        if (boundingbox) {
                            //hard coded color for now. TODO: randomly assign colors
                            boundingbox.children[0].material.color.r = 1;
                            boundingbox.children[0].material.color.g = .75;
                            boundingbox.children[0].material.color.b = .5;
                            this.SelectionBoundsContainer.add(boundingbox);
                        }
                        peerselection.bounds.push(boundingbox);
                    }
                }
            }
            if(method == "modifierStackUpdated" && this.isSelected(id))
                this.updateBounds();
        }
        this.deletedNode = function(vwfID)
        {
            if(this.isSelected(vwfID))
            {
                var i = SelectedVWFNodes.indexOf(vwfID);
                SelectedVWFNodes.splice(i,1);

            }
        }
        this.initializedProperty = function(id, propname, val) {
            this.satProperty(id, propname, val);
        }
        this.satProperty = function(id, propname, val) {


            //here, we update the selection bounds rect when the selction transforms
            if (window._Editor && propname == 'transform' && _Editor.isSelected(id)) {
                _Editor.updateBoundsTransform(id);
                if (Engine.client() == Engine.moniker()) {
                    if (_Editor.waitingForSet.length)
                        _Editor.waitingForSet.splice(_Editor.waitingForSet.indexOf(id), 1);

                }
                if (_Editor.waitingForSet.length == 0 || Engine.client() != Engine.moniker()) {
                    _Editor.updateGizmoLocation();
                   // _Editor.updateGizmoSize();
                    _Editor.updateGizmoOrientation(false);
                }

            }
            if (window._Editor && propname == 'DisplayName' && _Editor.isSelected(id)) {
                $('#StatusSelectedName').html((val).escape());
            }



            //when an object moves, check that it's not hilighted by the peer selection display.
            //if it is, update the matrix of the selection rectangle.
            if (Engine.client() != Engine.moniker() && propname == 'transform') {

                if (!this.peerSelections)
                    this.peerSelections = {};
                if (this.peerSelections[Engine.client()]) {


                    var peerselection = this.peerSelections[Engine.client()];

                    for (var i = 0; i < peerselection.nodes.length; i++) {
                        var boundingbox = peerselection.bounds[i];
                        if (boundingbox && boundingbox.vwfid == id) {

                            boundingbox.matrix = self.findviewnode(id).matrixWorld.clone();
                            boundingbox.updateMatrixWorld(true);

                        }
                    }
                }
            }

        }

        this.SelectParent = function() {
            if (self.GetSelectedVWFNode()) self.SelectObject(Engine.parent(self.GetSelectedVWFID()));
        }
        this.intersectLinePlane = function(ray, raypoint, planepoint, planenormal) {
            var n = MATH.dotVec3(MATH.subVec3(planepoint, raypoint), planenormal);
            var d = MATH.dotVec3(ray, planenormal);
            if (d == 0) return null;
            var dist = n / d;
            return dist;
            //var alongray = MATH.scaleVec3(ray,dist);
            //var intersect = MATH.addVec3(alongray,	raypoint);
            //return intersect;
        }.bind(this);
        this.intersectLinePlaneTEST = function(ray, raypoint, planepoint, planenormal) {
            var tmatrix = [CurrentX[0], CurrentY[0], CurrentZ[0], 0,
                CurrentX[1], CurrentY[1], CurrentZ[1], 0,
                CurrentX[2], CurrentY[2], CurrentZ[2], 0,
                0, 0, 0, 1
            ];
            tmatrix = MATH.transposeMat4(tmatrix);
            var tplanepoint = MATH.mulMat4Vec3(tmatrix, planepoint);
            var tplanenormal = MATH.mulMat4Vec3(tmatrix, planenormal);
            var traypoint = MATH.mulMat4Vec3(tmatrix, raypoint);
            var tray = MATH.mulMat4Vec3(tmatrix, ray);
            var n = MATH.dotVec3(MATH.subVec3(tplanepoint, traypoint), tplanenormal);
            var d = MATH.dotVec3(tray, tplanenormal);
            if (d == 0) {
                return [0, 0, 0];

            }
            var dist = n / d;
            var tpoint = MATH.addVec3(raypoint, MATH.scaleVec3(tray, dist));
            return tpoint;
            //var alongray = MATH.scaleVec3(ray,dist);
            //var intersect = MATH.addVec3(alongray,	raypoint);
            //return intersect;
        }.bind(this);
        this.GetCameraCenterRay = function(e) {
            screenmousepos = [0, 0, 0, 1];
            var worldmousepos = MATH.mulMat4Vec4(MATH.inverseMat4(self.getViewProjection()), screenmousepos);
            worldmousepos[0] /= worldmousepos[3];
            worldmousepos[1] /= worldmousepos[3];
            worldmousepos[2] /= worldmousepos[3];
            var campos = this.getCameraPosition();
            var ray = MATH.subVec3(worldmousepos, campos);
            var dist = MATH.lengthVec3(ray);
            ray = MATH.scaleVec3(ray, 1.0 / MATH.lengthVec3(ray));
            return ray;
        }.bind(this);
        this.GetWorldPickRay = function(e) {
            var OldX = e.clientX - $('#index-vwf').offset().left;
            var OldY = e.clientY - $('#index-vwf').offset().top;
            var screenmousepos = [OldX / document.getElementById('index-vwf').clientWidth, OldY / document.getElementById('index-vwf').clientHeight, 0, 1];
            screenmousepos[0] *= 2;
            screenmousepos[1] *= 2;
            screenmousepos[0] -= 1;
            screenmousepos[1] -= 1;
            screenmousepos[1] *= -1;
            var worldmousepos = MATH.mulMat4Vec4(MATH.inverseMat4(self.getViewProjection()), screenmousepos);
            worldmousepos[0] /= worldmousepos[3];
            worldmousepos[1] /= worldmousepos[3];
            worldmousepos[2] /= worldmousepos[3];
            var campos = this.getCameraPosition();
            var ray = MATH.subVec3(worldmousepos, campos);
            var dist = MATH.lengthVec3(ray);
            ray = MATH.scaleVec3(ray, 1.0 / MATH.lengthVec3(ray));
            return ray;
        }.bind(this);
        //quick function to initialize a blank matrix array
        this.Matrix = function() {
            var mat = [];
            for (var i = 0; i < 16; i++) {
                mat.push(0);
            }
            return mat;
        }.bind(this);
        //quick function to initialize a blank vector array
        this.Vec3 = function() {
            var vec = [];
            for (var i = 0; i < 3; i++) {
                vec.push(0);
            }
            return vec;
        }.bind(this);
        this.Quat = function() {
            var quat = [];
            for (var i = 0; i < 4; i++) {
                quat.push(0);
            }
            return quat;
        }.bind(this);
        this.SnapTo = function(value, nearist) {
            value = value / nearist;
            if (value > 0) value = Math.floor(value);
            else value = Math.ceil(value);
            value *= nearist;
            return value;
        }.bind(this);
        //input rotation matrix, axis, angle in radians, return rotation matrix
        this.RotateAroundAxis = function(RotationMatrix, Axis, Radians, rotationMatrix) {
            if (CoordSystem == WorldCoords) {
                var childmat = this.GetRotationMatrix(toGMat(self.findviewnode(self.GetSelectedVWFID()).matrixWorld));
                var parentmat = this.GetRotationMatrix(toGMat(self.findviewnode(self.GetSelectedVWFID()).parent.matrixWorld));
                Axis = MATH.mulMat4Vec3(MATH.inverseMat4(parentmat), Axis);
            }
            if (CoordSystem == LocalCoords) {
                var childmat = this.GetRotationMatrix(toGMat(self.findviewnode(self.GetSelectedVWFID()).matrixWorld));
                Axis = MATH.mulMat4Vec3(MATH.inverseMat4(childmat), Axis);
            }
            //Get a quaternion for the input matrix
            var OriginalQuat = goog.vec.Quaternion.fromRotationMatrix4(RotationMatrix, this.Quat());
            var RotationQuat = goog.vec.Quaternion.fromAngleAxis(Radians, Axis, this.Quat());
            var RotatedQuat = goog.vec.Quaternion.concat(RotationQuat, OriginalQuat, this.Quat());
            var NewMatrix = goog.vec.Quaternion.toRotationMatrix4(RotatedQuat, this.Matrix());
            return NewMatrix;
        }.bind(this);
        this.TransformOffset = function(gizoffset, id) {
            //self.findviewnode(id).parent.updatethis.Matrix();
            var parentmat = toGMat(self.findviewnode(id).parent.matrixWorld);
            parentmat = MATH.inverseMat4(parentmat);
            parentmat[3] = 0;
            parentmat[7] = 0;
            parentmat[11] = 0;
            //return gizoffset;
            return MATH.mulMat4Vec3(parentmat, gizoffset);
        }.bind(this)
        this.GetRotationTransform = function(Axis, Radians) {
            if (CoordSystem == WorldCoords) {
                //self.findviewnode(self.GetSelectedVWFID()).parent.updatethis.Matrix();
                var parentmat = this.GetRotationMatrix(toGMat(self.findviewnode(self.GetSelectedVWFID()).parent.matrixWorld));
                Axis = MATH.mulMat4Vec3(parentmat, Axis);
            }
            if (CoordSystem == LocalCoords) {
                //self.findviewnode(self.GetSelectedVWFID()).updatethis.Matrix();
                var childmat = this.GetRotationMatrix(toGMat(self.findviewnode(self.GetSelectedVWFID()).matrix));
                Axis = MATH.mulMat4Vec3(MATH.inverseMat4(childmat), Axis);
            }
            //Get a quaternion for the input matrix
            var RotationQuat = goog.vec.Quaternion.fromAngleAxis(Radians, Axis, this.Quat());
            var NewMatrix = goog.vec.Quaternion.toRotationMatrix4(RotationQuat, this.Matrix());
            return NewMatrix;
        }.bind(this);
        //takes a normal 4x4 rotation matrix and returns a VWF style angle axis
        //in the format {angle:0,axis:[0,1,0]} with the angle in degrees
        this.RotationToVWFAngleAxis = function(RotationMatrix) {
            var OriginalQuat = goog.vec.Quaternion.fromRotationMatrix4(RotationMatrix, this.Quat());
            //convert to angle axis with angle in Radians
            var NewAxis = [0, 0, 0];
            var NewAngle = goog.vec.Quaternion.toAngleAxis(OriginalQuat, NewAxis);
            return {
                angle: 57.2957795 * NewAngle,
                axis: NewAxis
            };
        }.bind(this);
        this.isMove = function(axis) {
            if (axis == 0 || axis == 1 || axis == 2 || axis == 12 || axis == 13 || axis == 14) return true;
            return false;
        }.bind(this);
        this.isRotate = function(axis) {
            if (axis == 3 || axis == 4 || axis == 5 || axis == 16 || axis == 17 || axis == 18) return true;
            return false;
        }.bind(this);
        this.SetLocation = function(object, vector) {
            object.position.x = vector[0];
            object.position.y = vector[1];
            object.position.z = vector[2];
        }.bind(this);
        this.MoveTransformGizmo = function(axis, amount) {
            return MATH.scaleVec3(axis, amount);
            var pos = GetLocation(MoveGizmo);
            pos = MATH.addVec3(pos, MATH.scaleVec3(axis, amount));
            this.SetLocation(MoveGizmo, pos);
        }
        this.GetLocation = function(object) {
            var vector = [0, 0, 0];
            vector[0] = object.position.x;
            vector[1] = object.position.y;
            vector[2] = object.position.z;
            return vector;
        }.bind(this);
        this.isScale = function(axis) {
            if (axis == 6 || axis == 7 || axis == 8 || axis == 9 || axis == 10 || axis == 11 || (axis >= 19 && axis <= 25)) return true;
            return false;
        }.bind(this);
        //input rotation matrix, axis, angle in radians, return rotation matrix
        this.RotateVecAroundAxis = function(Vector, Axis, Radians) {
            //Get a quaternion for the input matrix
            var RotationQuat = goog.vec.Quaternion.fromAngleAxis(Radians, Axis, this.Quat());
            var NewMatrix = goog.vec.Quaternion.toRotationMatrix4(RotationQuat, this.Matrix());
            return MATH.mulMat4Vec3(NewMatrix, Vector);
        }.bind(this);
        //$('#vwf-root').mousemove(function(e){
        this.displayVec = function(e) {
            for (var i = 0; i < e.length; i++) {
                e[i] *= 100;
                e[i] = Math.floor(e[i]);
                e[i] /= 100;
            }
            return JSON.stringify(e);
        }

        function tI(x, y) {
            x = x - 1;
            y = y - 1;
            return x * 4 + y;
        }
        this.GetRotationMatrix = function(mat) {
            var rmat = this.Matrix();
            for (var i = 0; i < mat.length; i++) rmat[i] = mat[i];
            rmat[3] = 0;
            rmat[7] = 0;
            rmat[11] = 0;
            //rmat = MATH.transposeMat4(rmat)
            var sx = Math.sqrt(rmat[0] * rmat[0] + rmat[4] * rmat[4] + rmat[8] * rmat[8]);
            var sy = Math.sqrt(rmat[1] * rmat[1] + rmat[5] * rmat[5] + rmat[9] * rmat[9]);
            var sz = Math.sqrt(rmat[2] * rmat[2] + rmat[6] * rmat[6] + rmat[10] * rmat[10]);
            rmat[0] = rmat[0] / sx;
            rmat[4] = rmat[4] / sx;
            rmat[8] = rmat[8] / sx;
            rmat[1] = rmat[1] / sy;
            rmat[5] = rmat[5] / sy;
            rmat[9] = rmat[9] / sy;
            rmat[2] = rmat[2] / sz;
            rmat[6] = rmat[6] / sz;
            rmat[10] = rmat[10] / sz;

            return MATH.transposeMat4(rmat);
        }
        this.waitingForSet = [];
        this.getPlaneDots = function(ray) {
            var xDot = Math.abs(MATH.dotVec3(ray, CurrentX));
            var yDot = Math.abs(MATH.dotVec3(ray, CurrentY));
            var zDot = Math.abs(MATH.dotVec3(ray, CurrentZ));
            var best = [xDot, yDot, zDot];
            best = best.sort(function(a, b) {
                return b - a
            });
            for (var i = 0; i < 3; i++) {
                if (best[i] == xDot)
                    best[i] = 'X';
                if (best[i] == yDot)
                    best[i] = 'Y';
                if (best[i] == zDot)
                    best[i] = 'Z';
            }
            return best;

        }
        this.mousemove_Gizmo = function(e) {

            //need to know this in order to show context menu properly
            MouseMoved = true;
            //prevent trying to move objects that have no 3D node

            if (SelectedVWFNodes.length > 0 && !this.findviewnode(SelectedVWFNodes[0].id)) return;

            //prevent moving 3D nodes that are not bound to the scene or are the scene itself
            if (SelectedVWFNodes.length > 0 && !(this.findviewnode(SelectedVWFNodes[0].id)).parent) return;


            //if (this.waitingForSet.length > 0) return;

            if (!MoveGizmo || MoveGizmo == null) {
                return;
            }

            if (this.MouseLeftDown) {
                this.mouseLastScreenPoint = [e.clientX, e.clientY];
                var w = this.mouseLastScreenPoint[0] - this.mouseDownScreenPoint[0];
                var h = this.mouseLastScreenPoint[1] - this.mouseDownScreenPoint[1];
                if (w > 0) this.selectionMarquee.css('width', w);
                else {
                    this.selectionMarquee.css('width', -w);
                    this.selectionMarquee.css('left', this.mouseLastScreenPoint[0]);
                }
                if (h > 0) this.selectionMarquee.css('height', h);
                else {
                    this.selectionMarquee.css('height', -h);
                    this.selectionMarquee.css('top', this.mouseLastScreenPoint[1]);
                }
            }

            if(!this.MouseLeftDown)
            {
                MoveGizmo.mouseMoved(e);
            }

             //display the name of the objject under the mouse
            if (Engine.views[0].lastPickId)
            {
                var mouseovernode = Engine.getProperty(Engine.views[0].lastPickId, 'DisplayName') || Engine.views[0].lastPickId;
                //avoid triggering a repaint of the status bar if the value is not changed
                if ($('#StatusMouseOverName').text() !== mouseovernode)
                    $('#StatusMouseOverName').html((mouseovernode).escape());
            }
            else
            {
                if ($('#StatusMouseOverName').text() !== 'Scene')
                    $('#StatusMouseOverName').html(('Scene').escape());
            }


        }.bind(this);
        this.isOwner = function(id, player) {
            var owner = Engine.getProperty(id, 'owner');
            if (typeof owner === 'string' && owner == player) {
                return true;
            }
            if (typeof owner === 'object' && owner.indexOf && owner.indexOf(player) != -1) {
                return true;
            }
            return false;
        }
        this.setProperty = function(id, prop, val) {
            var ret = _PermissionsManager.setProperty(id, prop, val);
            if (!ret)
                _Notifier.notify('You do not have permission to modify this object');

            return ret;
        }


        this.GetInsertPoint = function(e) {
            var campos = this.getCameraPosition();
            if (e) {
                var ray;
                ray = this.GetWorldPickRay(e);

                var pick = this.ThreeJSPick(campos, ray, {
                    filter: function(o) {
                        return !(o.isAvatar === true)
                    },ignore:[self.GetMoveGizmo().getGizmoBody()]
                });

                var newintersectxy = [0, 0, 0];
                if (pick) {
                    var dxy = pick.distance;
                    newintersectxy = MATH.addVec3(campos, MATH.scaleVec3(ray, dxy * .99));
                }

                var dxy2 = this.intersectLinePlane(ray, campos, [0, 0, 0], [0, 0, 1]);
                var newintersectxy2 = MATH.addVec3(campos, MATH.scaleVec3(ray, dxy2));
                newintersectxy2[2] += .01;
                if (newintersectxy2[2] > newintersectxy[2]) newintersectxy = newintersectxy2;
                return newintersectxy;
            } else {

                var ray = self.GetCameraCenterRay();
                var pick = this.ThreeJSPick(campos, ray, {
                    filter: function(o) {
                        return !(o.isAvatar === true)
                    }
                });
                var dxy = pick ? pick.distance : Infinity;
                var newintersectxy = MATH.addVec3(campos, MATH.scaleVec3(ray, dxy));
                newintersectxy[2] += .01;
                var dxy2 = this.intersectLinePlane(ray, campos, [0, 0, 0], [0, 0, 1]);
                var newintersectxy2 = MATH.addVec3(campos, MATH.scaleVec3(ray, dxy2));
                newintersectxy2[2] += .01;
                var finalpos = newintersectxy[2] > newintersectxy2[2] ? newintersectxy : newintersectxy2;
                finalpos[0] = this.SnapTo(finalpos[0],MoveSnap)
                finalpos[1] = this.SnapTo(finalpos[1],MoveSnap)
                finalpos[2] = this.SnapTo(finalpos[2],MoveSnap)
                return finalpos;
            }
        }
        this.createChild = function(parent, name, proto, uri, callback) {
            if (_UserManager.GetCurrentUserName() == null) {
                _Notifier.notify('You must log in to participate');
                return;
            }
            if (_PermissionsManager.getPermission(_UserManager.GetCurrentUserName(), parent) == 0) {
                _Notifier.alert('You must have permissions on the parent object to create a child');
                return;
            }
            _UndoManager.recordCreate(parent, name, proto, uri);
            vwf_view.kernel.createChild(parent, name, proto, uri, callback);
        }
        this.createLight = function(type, pos, owner) {
            var proto = {
                extends: 'SandboxLight.vwf',
                properties: {
                    rotation: [1, 0, 0, 0],
                    transform: MATH.transposeMat4(MATH.translateMatrix(pos)),
                    owner: owner,
                    type: 'Light',
                    lightType: type,
                    DisplayName: self.GetUniqueName('Light')
                }
            };
            var newname = GUID();
            this.createChild('index-vwf', newname, proto, null, null);
            this.SelectOnNextCreate([newname]);
        }
        this.createParticleSystem = function(type, pos, owner) {
            var proto = {
                extends: 'SandboxParticleSystem.vwf',
                properties: {
                    rotation: [1, 0, 0, 0],
                    transform: MATH.transposeMat4(MATH.translateMatrix(pos)),
                    owner: owner,
                    type: 'ParticleSystem',
                    DisplayName: self.GetUniqueName('ParticleSystem')
                }
            };

			var props = {};
			switch(type){
				case 'spray':
					props = {
						emitterType: 'point', solver: 'AnalyticShader', velocityMode: 'cartesian',
						particleCount: 200, maxRate: 0.75, minLifeTime: 1, maxLifeTime: 1,
						minVelocity: [-1,-1,2], maxVelocity: [1,1,5],
						minAcceleration: [0,0,-9.82], maxAcceleration: [0,0,-9.82],
						startSize: 0.04, endSize: 0.04, sizeRange: 0.02,
						startAlpha: 1, endAlpha: 0.5, alphaRange: 0, alphaTest: 0.75
					};
				break;
				case 'suspended':
					props = {
						emitterType: 'box', emitterSize: [10,10,10], solver: 'AnalyticShader', velocityMode: 'cartesian',
						particleCount: 200, maxRate: 0.75, minLifeTime: 1, maxLifeTime: 168,
						minVelocity: [-0.01,-0.01,-0.01], maxVelocity: [0.01,0.01,0.01],
						minAcceleration: [0,0,0], maxAcceleration: [0,0,0],
						startSize: 0.03, endSize: 0.03, sizeRange: 0,
						startAlpha: 0.5, endAlpha: 0.25, alphaRange: 0, alphaTest: 0.28,
						startColor_noAplha: [0.43,0.43,0.43], endColor_noAplha: [0.43,0.43,0.43]
					};
				break;
				case 'atmospheric':
					props = {
						emitterType: 'box', emitterSize: [10,10,10], solver: 'AnalyticShader', velocityMode: 'cartesian',
						particleCount: 1000, maxRate: 1, minLifeTime: 1, maxLifeTime: 1,
						minVelocity: [-1,-1,-5], maxVelocity: [1,1,-15],
						minAcceleration: [0,0,0], maxAcceleration: [0,0,0],
						startSize: 0.02, endSize: 0, sizeRange: 0,
						startAlpha: 1, endAlpha: 1, alphaRange: 0, alphaTest: 0.5,
						startColor_noAplha: [1,1,1], endColor_noAplha: [1,1,1]
					};
				break;

			}

			for(var i in props){
				proto.properties[i] = props[i];
			}

            var newname = GUID();
            this.createChild('index-vwf', newname, proto, null, null);
            this.SelectOnNextCreate([newname]);
        }
        this.snapPosition = function(pos)
        {
            var newpos = pos.slice(0);
            newpos[0] = this.SnapTo(newpos[0], MoveSnap);
            newpos[1] = this.SnapTo(newpos[1], MoveSnap);
            newpos[2] = this.SnapTo(newpos[2], MoveSnap);
            return newpos;
        }
        this.CreateCamera = function(translation, owner, id) {
            translation[0] = this.SnapTo(translation[0], MoveSnap);
            translation[1] = this.SnapTo(translation[1], MoveSnap);
            translation[2] = this.SnapTo(translation[2], MoveSnap);
            var CamProto = {
                extends: 'SandboxCamera' + '.vwf',
                properties: {}
            };
            CamProto.type = 'subDriver/threejs';
            CamProto.source = 'vwf/model/threejs/' + 'camera' + '.js';

            CamProto.properties.transform = MATH.transposeMat4(MATH.translateMatrix(translation));
            CamProto.properties.owner = owner;
            CamProto.properties.DisplayName = self.GetUniqueName('Camera');
            var newname = GUID();
            this.createChild('index-vwf', newname, CamProto, null, null);
            this.SelectOnNextCreate([newname]);
        };
        this.CreatePhysicsConstraint = function(type, owner) {
            var ConstraintProto = {
                extends: type + 'Constraint' + '.vwf',
                properties: {}
            };
            if(_Editor.getSelectionCount() == 0 || _Editor.getSelectionCount() > 2)
                ConstraintProto.properties.transform = MATH.transposeMat4(MATH.translateMatrix( _Editor.GetInsertPoint()));
            if(_Editor.getSelectionCount() == 1)
            {
                var trans = Engine.getProperty(_Editor.GetSelectedVWFID(),'transform');
                trans = [trans[12],trans[13],trans[14] ]
                ConstraintProto.properties.transform = MATH.transposeMat4(MATH.translateMatrix(trans));
                ConstraintProto.properties.___physics_joint_body_A = _Editor.GetSelectedVWFNode(0).id;
            }
            if(_Editor.getSelectionCount() == 2)
            {
                var trans = Engine.getProperty(_Editor.GetSelectedVWFNode(0).id,'transform');
                trans = [trans[12],trans[13],trans[14] ];
                var trans2 = Engine.getProperty(_Editor.GetSelectedVWFNode(1).id,'transform');
                trans2 = [trans2[12],trans2[13],trans2[14] ];
                trans[0] = (trans[0] + trans2[0])/2;
                trans[1] = (trans[1] + trans2[1])/2;
                trans[2] = (trans[2] + trans2[2])/2;
                ConstraintProto.properties.transform = MATH.transposeMat4(MATH.translateMatrix(trans));
                ConstraintProto.properties.___physics_joint_body_A = _Editor.GetSelectedVWFNode(0).id;
                ConstraintProto.properties.___physics_joint_body_B = _Editor.GetSelectedVWFNode(1).id;
            }

            ConstraintProto.properties.owner = owner;
            ConstraintProto.properties.DisplayName = self.GetUniqueName(type + ' Constraint');
            var newname = GUID();
            this.createChild('index-vwf', newname, ConstraintProto, null, null);
            this.SelectOnNextCreate([newname]);
        };


      this.CreateTurtle = function(type, translation, size, texture, owner, id) {
         var turtleProto = this.CreatePrimProto(type, translation, size, texture, owner, id);
         var penID = GUID();
        // debugger;
         var penProto = this.CreatePrimProto('line', [0, 0, 0], size, texture, owner, penID);
         penProto.properties.DisplayName = 'pen';
         turtleProto.children = {};
         turtleProto.children[penID] = penProto;

         var newname = GUID();
         this.createChild('index-vwf', newname, turtleProto, null, null);
         this.SelectOnNextCreate([newname]);
      }.bind(this);

      this.CreatePrimProto = function(type, translation, size, texture, owner, id) {
          translation[0] = this.SnapTo(translation[0], MoveSnap);
          translation[1] = this.SnapTo(translation[1], MoveSnap);
          translation[2] = this.SnapTo(translation[2], MoveSnap);
          translation[2] += .001;
          var BoxProto = {
              extends: type + '2.vwf',
              properties: {}
          };
          BoxProto.type = 'subDriver/threejs';
          BoxProto.source = 'vwf/model/threejs/' + type + '.js';
          var proto = BoxProto;

          var defaultmaterialDef = {
              shininess: 15,
              alpha: 1,
              ambient: {
                  r: 1,
                  g: 1,
                  b: 1
              },
              color: {
                  r: 1,
                  g: 1,
                  b: 1,
                  a: 1
              },
              emit: {
                  r: 0,
                  g: 0,
                  b: 0
              },
              reflect: 0.0,
              shadeless: false,
              shadow: true,
              specularColor: {
                  r: 0.5773502691896258,
                  g: 0.5773502691896258,
                  b: 0.5773502691896258
              },
              specularLevel: 1,
              layers: [{
                  alpha: 1,
                  blendMode: 0,
                  mapInput: 0,
                  mapTo: 1,
                  offsetx: 0,
                  offsety: 0,
                  rot: 0,
                  scalex: 1,
                  scaley: 1,
                  src: "checker.jpg"
              }]
          }

          proto.properties.materialDef = defaultmaterialDef;
          proto.properties.size = size;
          proto.properties.transform = MATH.transposeMat4(MATH.translateMatrix(translation));
          proto.properties.scale = [1, 1, 1];
          proto.properties.rotation = [0, 0, 1, 0];
          proto.properties.owner = owner;
          proto.properties.texture = texture;
          proto.properties.type = 'primitive';
          proto.properties.tempid = id;
          proto.properties.DisplayName = self.GetUniqueName(type);
          //proto.properties.children = {};
          return proto;
      }


        this.CreatePrim = function(type, translation, size, texture, owner, id) {
            translation[0] = this.SnapTo(translation[0], MoveSnap);
            translation[1] = this.SnapTo(translation[1], MoveSnap);
            translation[2] = this.SnapTo(translation[2], MoveSnap);
            translation[2] += .001;
            var BoxProto = {
                extends: (type==='node' ? 'http://vwf.example.com/node3' : type+'2')+'.vwf',
                properties: {}
            };
            var proto = BoxProto;

            if( type !== 'node' ){
                BoxProto.source = 'vwf/model/threejs/' + type + '.js';
                BoxProto.type = 'subDriver/threejs';
                var defaultmaterialDef = {
                    shininess: 15,
                    alpha: 1,
                    ambient: {
                        r: 1,
                        g: 1,
                        b: 1
                    },
                    color: {
                        r: 1,
                        g: 1,
                        b: 1,
                        a: 1
                    },
                    emit: {
                        r: 0,
                        g: 0,
                        b: 0
                    },
                    reflect: 0.0,
                    shadeless: false,
                    shadow: true,
                    specularColor: {
                        r: 0.5773502691896258,
                        g: 0.5773502691896258,
                        b: 0.5773502691896258
                    },
                    specularLevel: 1,
                    layers: [{
                        alpha: 1,
                        blendMode: 0,
                        mapInput: 0,
                        mapTo: 1,
                        offsetx: 0,
                        offsety: 0,
                        rot: 0,
                        scalex: 1,
                        scaley: 1,
                        src: "checker.jpg"
                    }]
                }

                proto.properties.materialDef = defaultmaterialDef;
                proto.properties.type = 'primitive';
            }
            else {
                proto.properties.glyphURL = '../vwf/view/editorview/images/icons/sphere.png';
            }

            proto.properties.transform = MATH.transposeMat4(MATH.translateMatrix(translation));

            proto.properties.owner = owner;

            proto.properties.DisplayName = self.GetUniqueName(type);
            var newname = GUID();

            this.createChild('index-vwf', newname, proto, null, null);
            this.SelectOnNextCreate([newname])
        }.bind(this);
        this.AddBlankBehavior = function() {
            if (this.GetSelectedVWFNode() == null) {
                _Notifier.notify('no object selected');
                return;
            }
            var ModProto = {
                extends: 'http://vwf.example.com/behavior.vwf',
                properties: {

                }
            };
            var proto = ModProto;
            proto.properties.type = 'behavior';
            proto.properties.DisplayName = self.GetUniqueName('behavior');
            proto.properties.owner = _UserManager.GetCurrentUserName();
            var id = this.GetSelectedVWFID();
            var owner = Engine.getProperty(id, 'owner');
            if (_PermissionsManager.getPermission(_UserManager.GetCurrentUserName(), id) == 0) {
                _Notifier.notify('You do not have permission to edit this object');
                return;
            }
            var newname = GUID();
            this.createChild(id, newname, proto, null, null);

        }
        this.CreateBehavior = function(type, owner) {

            if (this.GetSelectedVWFNode() == null) {
                _Notifier.notify('no object selected');
                return;
            }
            var ModProto = {
                extends: type + '.vwf',
                 properties: {

                }
            };
            var proto = ModProto;
            proto.properties.owner = owner;
            proto.properties.type = 'behavior';
            proto.properties.DisplayName = self.GetUniqueName(type);
            var id = this.GetSelectedVWFID();
            var owner = Engine.getProperty(id, 'owner');
            if (_PermissionsManager.getPermission(_UserManager.GetCurrentUserName(), id) == 0) {
                _Notifier.notify('You do not have permission to edit this object');
                return;
            }
            var newname = GUID();
            this.createChild(id, newname, proto, null, null);

            window.setTimeout(function() {
                $(document).trigger('modifierCreated', self.GetSelectedVWFNode());
            }, 500);

        }
        this.CreateModifier = function(type, owner, subDriver) {
            if (this.GetSelectedVWFNode() == null) {
                _Notifier.notify('no object selected');
                return;
            }
            var ModProto = {
                extends: type + '.vwf',
                properties: {
                    NotProto: ""
                }
            };
            var proto = ModProto;
            if (subDriver) {
                ModProto.type = 'subDriver/threejs';
                ModProto.source = 'vwf/model/threejs/' + type + '.js';
            }



            proto.properties.owner = owner;
            proto.properties.type = 'modifier';
            proto.properties.DisplayName = self.GetUniqueName(type);
            var id = this.GetFirstChildLeaf(this.GetSelectedVWFNode()).id;
            var owner = Engine.getProperty(id, 'owner');
            if (_PermissionsManager.getPermission(_UserManager.GetCurrentUserName(), id) == 0) {
                _Notifier.notify('You do not have permission to edit this object');
                return;
            }
            this.createChild(id, GUID(), proto, null, null);
            window.setTimeout(function() {
                $(document).trigger('modifierCreated', self.GetSelectedVWFNode());
            }, 500);
        }.bind(this);
        this.CreateModifierSubDriver = function(type, owner) {
            if (this.GetSelectedVWFNode() == null) {
                _Notifier.notify('no object selected');
                return;
            }
            var ModProto = {
                extends: type + '.vwf',
                properties: {
                    NotProto: ""
                }
            };
            var proto = ModProto;
            BoxProto.type = 'subDriver/threejs';
            BoxProto.source = 'vwf/model/threejs/' + type + '.js';
            proto.NotProto = "NOT!";

            proto.properties.owner = owner;
            proto.properties.type = 'modifier';
            proto.properties.DisplayName = self.GetUniqueName(type);
            var id = this.GetFirstChildLeaf(this.GetSelectedVWFNode()).id;
            var owner = Engine.getProperty(id, 'owner');
            if (_PermissionsManager.getPermission(_UserManager.GetCurrentUserName(), id) == 0) {
                _Notifier.notify('You do not have permission to edit this object');
                return;
            }
            this.createChild(id, GUID(), proto, null, null);
            window.setTimeout(function() {
                $(document).trigger('modifierCreated', this.GetSelectedVWFNode());
            }, 500);
        }.bind(this);
        this.GetFirstChildLeaf = function(object) {
            if (object) {
                if (object.children) {
                    for (var i in object.children) {
                        if (Engine.getProperty(object.children[i].id, 'isModifier') == true) return this.GetFirstChildLeaf(object.children[i]);
                    }
                }
                return object;
            }
            return null;
        }
        this.Duplicate = function() {
            for (var i = 0; i < SelectedVWFNodes.length; i++)
                if (Engine.prototype(SelectedVWFNodes[i].id) == 'character-vwf') {
                    _Notifier.alert('Avatars cannot be copied');
                    return
                }
            var newnames = [];
            for (var i = 0; i < SelectedVWFNodes.length; i++) {
                var proto = _DataManager.getCleanNodePrototype(SelectedVWFNodes[i].id);
                proto.properties.DisplayName = self.GetUniqueName(proto.properties.DisplayName);
                var parent = Engine.parent(self.GetSelectedVWFID());
                var newname = GUID();
                newnames.push(newname);
                self.createChild(parent, newname, proto, null, null, function() {
                    alert();
                });
            }
            self.SelectOnNextCreate(newnames);

        }.bind(this);
        this.DeleteIDs = function(t) {
            if (t.id != undefined) delete t.id;
            if (t.children) {
                var children = []
                for (var i in t.children) {
                    DeleteIDs(t.children[i]);
                    children.push(t.children[i]);
                    delete t.children[i];
                }
                for (var i = 0; i < children.length; i++) {
                    t.children[GUID()] = children[i];
                }
            }
        }
        this.Copy = function(nodes) {

            _CopiedNodes = [];

            for (var i = 0; i < SelectedVWFNodes.length; i++)
                if (Engine.prototype(SelectedVWFNodes[i].id) == 'character-vwf') {
                    _Notifier.alert('Avatars cannot be copied');
                    return
                }

            var tocopy = SelectedVWFNodes;
            if (nodes) tocopy = nodes;
            for (var i = 0; i < tocopy.length; i++) {
                var t = _DataManager.getCleanNodePrototype(tocopy[i].id);
                // if the node has a transform property, we need to find the offset from the gizmo to the object.
                //this is so we can paste a group in a way that makes sense
                if (t.properties && t.properties.transform) {
                    var tpos = new THREE.Vector3();
                    tpos.setFromMatrixPosition(MoveGizmo.getGizmoBody().matrixWorld);
                    originalGizmoPos = [tpos.x, tpos.y, tpos.z];
                    var gizoffset = MATH.subVec3(this.getTranslationCallback(tocopy[i].id), originalGizmoPos);
                    t.properties.transform[12] = gizoffset[0];
                    t.properties.transform[13] = gizoffset[1];
                    t.properties.transform[14] = gizoffset[2];
                    delete t.properties.translation;
                    delete t.properties.rotation;
                    delete t.properties.quaternion;
                    delete t.properties.scale;
                }
                _CopiedNodes.push(t);
            }
        }.bind(this);
        this.getCameraPosition = function() {
            var cam = this.findcamera();
            cam.updateMatrixWorld(true);
            return [cam.matrixWorld.elements[12], cam.matrixWorld.elements[13], cam.matrixWorld.elements[14]];

        }
        this.Paste = function(useMousePoint) {

            var newnames = [];
            for (var i = 0; i < _CopiedNodes.length; i++) {
                var t = _CopiedNodes[i];
                t = _DataManager.getCleanNodePrototype(t);

                //if the object is the type which can have transforms, update them to be relative to the current paste point, or the center of the screen
                if (t.properties && t.properties.transform) {
                    var campos = this.getCameraPosition();
                    var newintersectxy;

                    if (!useMousePoint) newintersectxy = self.GetInsertPoint();
                    else {
                        var ray;
                        ray = this.GetWorldPickRay(this.ContextShowEvent);

                        var pick = this.ThreeJSPick(campos, ray, {
                            filter: function(o) {
                                return !(o.isAvatar === true)
                            },ignore:[self.GetMoveGizmo().getGizmoBody()]
                        });

                        var dxy = pick.distance;
                        newintersectxy = MATH.addVec3(campos, MATH.scaleVec3(ray, dxy * .99));
                        var dxy2 = this.intersectLinePlane(ray, campos, [0, 0, 0], [0, 0, 1]);
                        var newintersectxy2 = MATH.addVec3(campos, MATH.scaleVec3(ray, dxy2));
                        newintersectxy2[2] += .01;
                        if (newintersectxy2[2] > newintersectxy[2]) newintersectxy = newintersectxy2;
                    }
                    //we stored the transform as an offset from the gizmo, so paste as an offset from the insert point
                    t.properties.transform[12] += newintersectxy[0];
                    t.properties.transform[13] += newintersectxy[1];
                    t.properties.transform[14] += newintersectxy[2];
                    t.properties.DisplayName = self.GetUniqueName(t.properties.DisplayName, i);
                }



                if (t.properties.type == 'behavior') {

                    if (self.GetSelectedVWFID()) {
                        self.createChild(this.GetSelectedVWFID(), GUID(), t, null, null);
                    } else {
                        alertify.alert('When pasting a behavior, select the node to paste onto')
                    }
                } else {

                    var newname = GUID();
                    newnames.push(newname);

                    self.createChild('index-vwf', newname, t, null, null);
                }

                //reset in c ase we paste again
                if (t.properties && t.properties.transform) {
                    t.properties.transform[12] -= newintersectxy[0];
                    t.properties.transform[13] -= newintersectxy[1];
                    t.properties.transform[14] -= newintersectxy[2];
                }
            }
            self.SelectOnNextCreate(newnames);
        }
        this.getTransform = function(id) {
            var mat = Engine.getProperty(id, this.transformPropertyName);
            if(!mat)
                return Mat4.createIdentity();
            return mat;
        }
        this.getWorldTransform = function(id) {
            var mat = Engine.getProperty(id, 'worldTransform');
            if(!mat)
                return Mat4.createIdentity();
            return mat;
        }
        this.getTranslation = function(id) {
            var mat = Engine.getProperty(id, 'worldTransform');
            if(!mat) return [0,0,0];
            return [mat[12], mat[13], mat[14]];
        }
        this.getScale = function(id) {
            var transform = Engine.getProperty(id, this.transformPropertyName);
            if(!transform) return [0,0,0];
            var sx = MATH.lengthVec3([transform[0], transform[4], transform[8]]);
            var sy = MATH.lengthVec3([transform[1], transform[5], transform[9]]);
            var sz = MATH.lengthVec3([transform[2], transform[6], transform[10]]);
            return [sx, sy, sz];
        }
        this.setTransform = function(id, val) {

            //don't bother if the value did not actually change
            if(matComploose(vwf.getProperty(id,'transform'),val))
            {
                return true;
            }
            //this.waitingForSet.push(id);
            var success = this.setProperty(id, 'transform', val);
            //if (!success) this.waitingForSet.pop();
            if (!success) this.SetLocation(MoveGizmo, originalGizmoPos);
            return success;
        }
        this.setTranslation = function(id, val) {
            var success = this.setProperty(id, this.translationPropertyName, val);
            //if (success) this.waitingForSet.push(id);
            if (!success) this.SetLocation(MoveGizmo, originalGizmoPos);
            return success;
        }
        this.setScale = function(id, val) {
            return this.setProperty(id, this.scalePropertyName, val);
        }
        this.setScaleCallback = this.setScale;
        this.setTransformCallback = this.setTransform;
        this.setTranslationCallback = this.setTranslation;

        this.getScaleCallback = this.getScale;
        this.getTransformCallback = this.getTransform;
        this.getWorldTransformCallback = this.getWorldTransform;
        this.getTranslationCallback = this.getTranslation;

        this.updateGizmoOrientation = function() {

            //prefer the override value


            if(CoordSystem == LocalCoords)
                this.MoveGizmo.updateOrientation(this.getTransformCallback(this.GetSelectedVWFID()));
            if(CoordSystem == WorldCoords)
                this.MoveGizmo.updateOrientation(this.getTransformCallback(Engine.application()));
            if(CoordSystem == ParentCoords)
                this.MoveGizmo.updateOrientation(this.getTransformCallback(Engine.parent(this.GetSelectedVWFID())));
        }.bind(this);
        this.triggerSelectionChanged = function(VWFNode) {

            $(document).trigger('selectionChanged', [VWFNode]);
        }.bind(this);
        this.triggerSelectionTransformed = function(VWFNode) {
            //this is no longer needed, since we set the GUI from reflector messages
            //$(document).trigger('selectionTransformedLocal', [VWFNode]);
        }.bind(this);
        this.updateGizmoLocation = function() {
            var transforms = [];
            for(var i in SelectedVWFNodes)
            {
               var node = findviewnode(SelectedVWFNodes[i].id);
               if(node)
               {
                transforms.push(_Editor.getTransformCallback(SelectedVWFNodes[i].id));    
               }
            }
            MoveGizmo.updateLocation(transforms);
        }
        this.updateBounds = function() {
            return; /// disable all drawing of bounding boxes
            for (var i = 0; i < SelectionBounds.length; i++) {
                SelectionBounds[i].parent.remove(SelectionBounds[i], true);
                SelectionBounds[i].children[0].geometry.dispose()
            }
            SelectionBounds = [];
            for (var i = 0; i < SelectedVWFNodes.length; i++) {
                //for nodes that have no 3D viewnode
                if (!self.findviewnode(SelectedVWFNodes[i].id))
                    continue;
                SelectionBounds[i] = this.createBoundingBox(SelectedVWFNodes[i].id);

                //	SelectionBounds[i].setMaterial(MATH.MaterialManager.findMaterialRecord(SelectionBounds[i].getMaterial()).material);
                this.SelectionBoundsContainer.add(SelectionBounds[i], true);
            }
        }
        this.createBoundingBox = function(id) {
            if (!self.findviewnode(id)) return null;
            var box;
            var mat;

            box = self.findviewnode(id).GetBoundingBox(true);
            mat = toGMat(self.findviewnode(id).matrixWorld).slice(0);
            var material = blueBoundingBoxMaterial;
            if (this.findviewnode(id).initializedFromAsset) color = redBoundingBoxMaterial;
            if (Engine.getProperty(id, 'type') == 'Group' && Engine.getProperty(id, 'open') == false) color = greenBoundingBoxMaterial;
            if (Engine.getProperty(id, 'type') == 'Group' && Engine.getProperty(id, 'open') == true) color = lightgreenBoundingBoxMaterial;
            var boundingbox = new THREE.Object3D();
            boundingbox.name = "Bounds_+" + id;
            boundingbox.add(this.BuildWireBox([box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]], [box.min[0] + (box.max[0] - box.min[0]) / 2, box.min[1] + (box.max[1] - box.min[1]) / 2, box.min[2] + (box.max[2] - box.min[2]) / 2], [0,0,0],material), true);
            boundingbox.children[0].name = "Bounds_+" + id + "_Mesh";
            boundingbox.matrixAutoUpdate = false;
            boundingbox.matrix.elements = MATH.transposeMat4(mat);
            boundingbox.updateMatrixWorld(true);

            boundingbox.children[0].renderDepth = -10000 - 3;

            boundingbox.children[0].PickPriority = -1;
            boundingbox.children[0].InvisibleToCPUPick = true;

            boundingbox.vwfid = id;
            box.release();
            return boundingbox;
        }
        this.updateBoundsTransform = function(id) {
            for (var i = 0; i < SelectionBounds.length; i++) {
                if (SelectionBounds[i].vwfid == id) {
                    var mat = toGMat(self.findviewnode(id).matrixWorld).slice(0);
                    SelectionBounds[i].matrix.elements = MATH.transposeMat4(mat);
                    SelectionBounds[i].updateMatrixWorld(true);
                }
            }
        }
        this.getSelectionCount = function() {
            return SelectedVWFNodes.length;
        }.bind(this);
        this.isSelected = function(id) {
            var index = -1;
            for (var i = 0; i < SelectedVWFNodes.length; i++)
                if (SelectedVWFNodes[i] && SelectedVWFNodes[i].id == id) index = i;
            if (index == -1) return false;
            return true;
        }.bind(this);
        this.OpenGroup = function() {
            for (var i = 0; i < this.getSelectionCount(); i++) {
                if (Engine.getProperty(SelectedVWFNodes[i].id, 'type') == 'Group') {
                    this.setProperty(SelectedVWFNodes[i].id, 'open', true);
                }
            }
            this.updateBounds();
        }
        this.CloseGroup = function() {

                var closedGroups = [];
                for (var i = 0; i < this.getSelectionCount(); i++) {

                    // look up the chain for a group, and close it if you find one

                    var parentGroup = SelectedVWFNodes[i].id;
                    while (parentGroup && Engine.getNode(parentGroup).extends !== 'sandboxGroup.vwf')
                        parentGroup = Engine.parent(parentGroup);

                    if (!parentGroup) continue;

                    if (Engine.getNode(parentGroup).extends == 'sandboxGroup.vwf') {
                        this.setProperty(parentGroup, 'open', false);
                        closedGroups.push(parentGroup);
                    }
                }
                this.updateBounds();
                this.SelectObject(closedGroups);
            }
            //new vwf kernel does not add the ID to the get node, but all our old code expects it. Add it and return the node.
        this.getNode = function(id,includeContinueBase) {
            if (!id) return null;
            try{
                var node = Engine.getNode(id, true, true,includeContinueBase);
                if(!node) return null;
            }catch(e) //this keeps happening because the node does not exist
            {
                return null;
            }
            node.id = id;

            var walk = function(parent) {
                for (var i in parent.children) {
                    parent.children[i].name = i;
                    walk(parent.children[i]);
                }

            }
            walk(node);
            node.name = Engine.name(id);
            if(!node.properties) node.properties = {};
            return node;
        }
        this.SelectObjectPublic = function(VWFNodeid, pickmod) {
            if (SelectMode == 'TempPick') {
                if (this.TempPickCallback) this.TempPickCallback(_Editor.getNode(VWFNodeid));
            } else {

                this.SelectObject(VWFNodeid, pickmod !== undefined ? pickmod : this.PickMod);
            }
        }
        this.SelectObject = function(VWFNode, selectmod, skipUndo) //the skip undo flag is necessary so that the undomanager can trigger new selections without messing up the undostack
            {

                this.waitingForSet.length = 0;
                //stop the GUI drag function

                this.guiNodeDragEnd();
                if (VWFNode && VWFNode.constructor == Array) {
                    VWFNode = VWFNode.slice(0); // don't modify the array in place, the caller might be using it!
                    for (var i = 0; i < VWFNode.length; i++) VWFNode[i] = _Editor.getNode(VWFNode[i]);
                } else if (typeof(VWFNode) == 'object') VWFNode = [VWFNode];
                else if (typeof(VWFNode) == 'string') VWFNode = [_Editor.getNode(VWFNode)];


                    //the editor can be loaded when tools are not, so this might not exist
                	if(!skipUndo && window._UndoManager)
                		window._UndoManager.recordSelection((VWFNode || []).slice(0));

                if (!selectmod) {
                    SelectedVWFNodes = [];
                }
                if (VWFNode && VWFNode[0] != null)
                    for (var i = 0; i < VWFNode.length; i++) {
                        //if you've selected a node that is grouped, but not selected a group directly, select the nearest open group head.
                        try {
                            if (Engine.getProperty(VWFNode[i].id, 'type') != 'Group') {
                                var testnode = VWFNode[i];
                                //'index-vwf can never be a group, skip getting it to check'
                                while (testnode && (Engine.getProperty(testnode.id, 'type') != 'Group' || (Engine.getProperty(testnode.id, 'type') == 'Group' && Engine.getProperty(testnode.id, 'open') == true))) {
                                    if (Engine.parent(testnode.id) == 'index-vwf') {
                                        testnode = null;
                                        break;
                                    } else {
                                        testnode = _Editor.getNode(Engine.parent(testnode.id));
                                    }
                                }
                                if (testnode)
                                    VWFNode[i] = testnode;
                            }
                        } catch (e) {}
                        if (!selectmod) {
                            if (VWFNode[i]) {
                                if (!this.isSelected(VWFNode[i].id)) SelectedVWFNodes.push(VWFNode[i]);
                            }
                        }
                        if (selectmod == Add) {
                            if (!this.isSelected(VWFNode[i].id)) SelectedVWFNodes.push(VWFNode[i]);
                        }
                        if (selectmod == Subtract) {
                            var index = -1;
                            for (var j = 0; j < SelectedVWFNodes.length; j++)
                                if (SelectedVWFNodes[j] && SelectedVWFNodes[j].id == VWFNode[i].id) index = j;
                            SelectedVWFNodes.splice(index, 1);
                        }

                        Engine.requestControl(VWFNode[i].id);
                    }
                if (SelectedVWFNodes[0]) this.SelectedVWFID = SelectedVWFNodes[0].id;
                else this.SelectedVWFID = null;
                this.triggerSelectionChanged(SelectedVWFNodes[0]);
                if (MoveGizmo == null) {

                    this.BuildMoveGizmo();
                }

                this.backupTransfroms = [];
                if (SelectedVWFNodes[0]) {

                    for (var s = 0; s < SelectedVWFNodes.length; s++) {
                        lastscale[s] = this.getScaleCallback(SelectedVWFNodes[s].id);

                        this.showMoveGizmo();
                        if (this.findviewnode(SelectedVWFNodes[s].id)) {
                            //this.findviewnode(SelectedVWFNodes[s].id).setTransformMode(MATH.P_MATRIX);
                            //this.findviewnode(SelectedVWFNodes[s].id).setRotMatrix(this.GetRotationMatrix(this.findviewnode(SelectedVWFNodes[s].id).getLocalthis.Matrix()));
                            //this.findviewnode(SelectedVWFNodes[s].id).updateMatrix
                        }
                    }

                    this.updateBoundsAndGizmoLoc();
                    this.updateGizmoOrientation(true);
                } else {
                    this.hideMoveGizmo();

                    if (SelectionBounds.length > 0) {
                        for (var i = 0; i < SelectionBounds.length; i++) {
                            SelectionBounds[i].parent.remove(SelectionBounds[i], true);
                            SelectionBounds[i].children[0].geometry.dispose()
                        }
                        SelectionBounds = [];
                    }
                }


                $('#StatusSelectedID').html(('No Selection').escape());
                $('#StatusSelectedName').html(('No Selection').escape());
                if (SelectedVWFNodes.length > 0) {
                    if (SelectedVWFNodes.length == 1)
                        $('#StatusSelectedID').html((SelectedVWFNodes[0].id).escape());
                    else
                        $('#StatusSelectedID').html((SelectedVWFNodes.length + ' objects').escape());

                    $('#StatusSelectedName').html((Engine.getProperty(SelectedVWFNodes[0].id, 'DisplayName') || SelectedVWFNodes[0].id).escape());
                    for (var i = 1; i < SelectedVWFNodes.length; i++)
                        $('#StatusSelectedName').html(($('#StatusSelectedName').text() + ', ' + Engine.getProperty(SelectedVWFNodes[i].id, 'DisplayName')).escape());
                }
                // do some hilighting of GUI nodes to refect selection
                $('.guiselected').off('dblclick', this.guiNodeDragStart);
                $('.guiselected').off('dblclick', this.guiNodeDragEnd);

                $('.guiselected').removeClass('guiselected');
                for (var i = 0; i < SelectedVWFNodes.length; i++) {
                    var id = SelectedVWFNodes[i].id;
                    $('#guioverlay_' + id).addClass('guiselected');

                }
                $('.guiselected').on('dblclick', this.guiNodeDragStart);



                //send a signal over the reflector to let others know that I have selected something.
                this.NotifyPeersOfSelection();
            }.bind(this);
        this.ResetTransforms = function() {
            for (var i = 0; i < SelectedVWFNodes.length; i++) {
                this.setProperty(SelectedVWFNodes[i].id, 'transform', [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], "You do not have permission to reset the transforms for this object");
            }
        }
        this.hideMoveGizmo = function() {

            this.MoveGizmo.hide();
        }
        this.showMoveGizmo = function() {

            this.MoveGizmo.show();
        }
        this.updateBoundsAndGizmoLoc = function() {
            self.updateGizmoLocation();
            self.updateGizmoSize();
            self.updateGizmoOrientation(false);
            self.updateBounds();

        }.bind(this);
        var tempcammatinverse = new THREE.Matrix4();
        var tgizpos2 = [0, 0, 0];
        var tcamposGizSpace = [0, 0, 0];
        var tgizpos = [0, 0, 0];
        var tempvec1 = [0, 0, 0];
        var transposeTemp = [];
        this.updateGizmoSize = function() {
            MoveGizmo.updateSize();
        }.bind(this);
        this.BuildMoveGizmo = function() {
            this.MoveGizmo = new transformTool();
            this.MoveGizmo.init();
            MoveGizmo = this.MoveGizmo;
            _SceneManager.addToRoot(this.MoveGizmo.getGizmoHead());
            this.findscene().add(this.MoveGizmo.getGizmoHead(), true);

        }.bind(this);
        this.SetGizmoMode = function(type) {
            if(!this.MoveGizmo)
                this.BuildMoveGizmo();
            this.MoveGizmo.SetGizmoMode(type);
        }

        this.BuildWireBox = function(size, offset, color, material) {

            var mesh = new THREE.Line(new THREE.Geometry(), material ||(new THREE.LineBasicMaterial()), THREE.LinePieces);
            if(! material){
                        mesh.material.color.r = color[0];
                        mesh.material.color.g = color[1];
                        mesh.material.color.b = color[2];
            }

            var vertices = [
                new THREE.Vector3(size[0] / 2, size[1] / 2, size[2] / 2),
                new THREE.Vector3(-size[0] / 2, size[1] / 2, size[2] / 2),
                new THREE.Vector3(-size[0] / 2, -size[1] / 2, size[2] / 2),
                new THREE.Vector3(size[0] / 2, -size[1] / 2, size[2] / 2),

                new THREE.Vector3(size[0] / 2, size[1] / 2, -size[2] / 2),
                new THREE.Vector3(-size[0] / 2, size[1] / 2, -size[2] / 2),
                new THREE.Vector3(-size[0] / 2, -size[1] / 2, -size[2] / 2),
                new THREE.Vector3(size[0] / 2, -size[1] / 2, -size[2] / 2)
            ];

            //mesh.matrix.setPosition(new THREE.Vector3(offset[0],offset[1],offset[2]));
            for (var i = 0; i < vertices.length; i++) {
                vertices[i].x += offset[0];
                vertices[i].y += offset[1];
                vertices[i].z += offset[2];
            }

            // TODO: Wouldn't be nice if Line had .segments?

            var geometry = mesh.geometry;
            geometry.vertices.push(
                vertices[0], vertices[1],
                vertices[1], vertices[2],
                vertices[2], vertices[3],
                vertices[3], vertices[0],

                vertices[4], vertices[5],
                vertices[5], vertices[6],
                vertices[6], vertices[7],
                vertices[7], vertices[4],

                vertices[0], vertices[4],
                vertices[1], vertices[5],
                vertices[2], vertices[6],
                vertices[3], vertices[7]
            );



            mesh.matrixAutoUpdate = false;
            mesh.updateMatrixWorld(true);
            return mesh;
        }.bind(this);



        //callback for setPArent. CAlled once a node is picked. Selected objects will become children of this node
        this.PickParentCallback = function(parentnode) {


            var newnames = [];
            //be sure to exit temp pick mode no matter what
            this.SetSelectMode('Pick');

            //do all checks ahead of time, bail if precoditions are not good
            if (parentnode) {
                var parent = parentnode.id;
                for (var i = 0; i < this.getSelectionCount(); i++) {
                    var id = this.GetSelectedVWFNode(i).id;

                    if (id != parent) {
                        if (Engine.parent(id) != parent) {
                            if (Engine.decendants(id).indexOf(parent) == -1) {

                            } else {
                                alertify.alert('This object cannot be assigned to be a child of one of its decendants')
                                return;
                            }
                        } else {
                            alertify.alert('This object is already the selected objects parent');
                            return;
                        }
                    } else {
                        alertify.alert('An object cannot be linked to itself');
                        return;
                    }
                }
            } else {
                alertify.alert('No object selected')
                return;
            }

            if (parentnode) {

                var parent = parentnode.id;
                _UndoManager.startCompoundEvent();
                for (var i = 0; i < this.getSelectionCount(); i++) {
                    var id = this.GetSelectedVWFNode(i).id;

                    if (id != parent) {
                        if (Engine.parent(id) != parent) {
                            if (Engine.decendants(id).indexOf(parent) == -1) {


                                var node = _DataManager.getCleanNodePrototype(id);

								if(this.findviewnode(id))
								{
	                                var childmat = toGMat(this.findviewnode(id).matrixWorld);
	                                var parentmat = toGMat(this.findviewnode(parentnode.id).matrixWorld);
	                                var invparentmat = MATH.inverseMat4(parentmat);
	                                childmat = MATH.mulMat4(invparentmat, childmat);
	                                delete node.properties.translation;
	                                delete node.properties.rotation;
	                                delete node.properties.quaternion;
	                                delete node.properties.scale;
	                                node.properties.transform = MATH.transposeMat4(childmat);
								}

                                var newname = GUID();
                                newnames.push(newname)
                                this.createChild(parentnode.id, newname, node);
                                _RenderManager.flashHilight(findviewnode(parentnode.id));

                            }
                        }
                    }
                }
                this.DeleteSelection();
                this.TempPickCallback = null;
                self.SelectOnNextCreate(newnames);
                this.SetSelectMode('Pick');
                _UndoManager.stopCompoundEvent();
            }

        }
        this.RemoveParent = function() {
                _UndoManager.startCompoundEvent();
                var newnames = [];
                for (var i = 0; i < this.getSelectionCount(); i++) {
                    var id = this.GetSelectedVWFNode(i).id;
                    _RenderManager.flashHilight(findviewnode(Engine.parent(id)));
                    var node = _DataManager.getCleanNodePrototype(id);

					if( this.findviewnode(id) )
					{
	                    var childmat = toGMat(this.findviewnode(id).matrixWorld);
	                    delete node.properties.translation;
	                    delete node.properties.rotation;
	                    delete node.properties.quaternion;
	                    delete node.properties.scale;
	                    node.properties.transform = MATH.transposeMat4(childmat);
					}

                    var newname = GUID();
                    newnames.push(newname);
                    this.createChild('index-vwf', newname, node);
                }

                this.DeleteSelection();
                self.SelectOnNextCreate(newnames);
                this.SetSelectMode('Pick');
                _UndoManager.stopCompoundEvent();
            }
            //Choose the node to become the parent of the selected node
        this.SetParent = function() {
            if (!this.GetSelectedVWFNode()) {
                _Notifier.alert('No object selected. Select the desired child, then use this to choose the parent.');
                return;
            }
			var viewnode = this.findviewnode(this.GetSelectedVWFID());
            if (viewnode && viewnode.initializedFromAsset) {
                _Notifier.alert('This object is part of a 3D asset, and cannot have its heirarchy modified');
                return;
            }

            this.SetSelectMode('TempPick');
            this.TempPickCallback = this.PickParentCallback;
        }
        this.UngroupSelection = function() {

            if (this.GetSelectedVWFNode(i).extends !== 'sandboxGroup.vwf') {
                alertify.alert('Selected object is not a group');
                return;
            }

            _UndoManager.startCompoundEvent();

            for (var i = 0; i < this.getSelectionCount(); i++) {
                var vwfparent = Engine.parent(this.GetSelectedVWFNode(i).id);
                var children = Engine.children(this.GetSelectedVWFNode(i).id);
                for (var j = 0; j < children.length; j++) {
                    var node = _DataManager.getCleanNodePrototype(children[j]);
                    var childmat = toGMat(this.findviewnode(children[j]).matrixWorld);
                    var parentmat = toGMat(this.findviewnode(vwfparent).matrixWorld);
                    var invparentmat = MATH.inverseMat4(parentmat);
                    childmat = MATH.mulMat4(invparentmat, childmat);
                    delete node.properties.translation;
                    delete node.properties.rotation;
                    delete node.properties.quaternion;
                    delete node.properties.scale;
                    node.properties.transform = MATH.transposeMat4(childmat);
                    _UndoManager.recordDelete(children[j])
                    vwf_view.kernel.deleteNode(children[j]);
                    var newname = GUID();
                    _UndoManager.recordCreate(vwfparent, newname, node);
                    vwf_view.kernel.createChild(vwfparent, newname, node);
                }
                _UndoManager.recordDelete(this.GetSelectedVWFNode(i).id);
                vwf_view.kernel.deleteNode(this.GetSelectedVWFNode(i).id);

            }
            _UndoManager.stopCompoundEvent();
            this.SelectObject();
        }
        this.GroupSelection = function() {
            var parentmat = MATH.identMatrix();
            var parent = this.findviewnode(this.GetSelectedVWFID()).parent;
            var pos;
            for (var i = 0; i < this.getSelectionCount(); i++) {
                if (parent != this.findviewnode(this.GetSelectedVWFNode(i).id).parent) {
                    _Notifier.alert('All objects must have the same parent to be grouped');
                    return;
                }
                // if(!self.isOwner(SelectedVWFNodes[i].id,document.PlayerNumber))
                // {
                // _Notifier.alert('You must be the owner of all objects to group them.');
                // return;
                // }
                var childmat = toGMat(this.findviewnode(this.GetSelectedVWFNode(i).id).matrixWorld);
                if (!pos) pos = [childmat[3], childmat[7], childmat[11]];
                else pos = MATH.addVec3(pos, [childmat[3], childmat[7], childmat[11]]);
            }
            pos = MATH.scaleVec3(pos, 1 / this.getSelectionCount());
            parentmat[3] = pos[0];
            parentmat[7] = pos[1];
            parentmat[11] = pos[2];
            var proto = {
                extends: 'sandboxGroup.vwf',
                properties: {
                    type: 'Group',
                    owner: _UserManager.GetCurrentUserName(),
                    transform: MATH.transposeMat4(parentmat)
                },
                children: {}
            };
            for (var i = 0; i < this.getSelectionCount(); i++) {
                var node = _DataManager.getCleanNodePrototype(this.GetSelectedVWFNode(i).id);
                var childmat = toGMat(this.findviewnode(this.GetSelectedVWFNode(i).id).matrixWorld);
                var invparentmat = MATH.inverseMat4(parentmat);
                childmat = MATH.mulMat4(invparentmat, childmat);
                delete node.properties.translation;
                delete node.properties.rotation;
                delete node.properties.quaternion;
                delete node.properties.scale;
                node.properties.transform = MATH.transposeMat4(childmat);
                proto.children[GUID()] = node;
            }
            _UndoManager.startCompoundEvent();
            this.DeleteSelection();
            var newname = GUID();
            _UndoManager.recordCreate('index-vwf', newname, proto)
            vwf_view.kernel.createChild('index-vwf', newname, proto);
            self.SelectOnNextCreate([newname]);
            this.SetSelectMode('Pick');
            _UndoManager.stopCompoundEvent();
        }
        this.findviewnode = function(id) {
            for (var i = 0; i < Engine.views.length; i++) {
                if (Engine.views[i] && Engine.views[i].state && Engine.views[i].state.nodes && Engine.views[i].state.nodes[id] && Engine.views[i].state.nodes[id].threeObject) return Engine.views[i].state.nodes[id].threeObject;
                if (Engine.views[i] && Engine.views[i].state && Engine.views[i].state.scenes && Engine.views[i].state.scenes[id] && Engine.views[i].state.scenes[id].threeScene) return Engine.views[i].state.scenes[id].threeScene;
            }
            return null;
        }.bind(this);
        this.SelectScene = function() {
            this.SelectObject('index-vwf');
        }
        this.guiNodeDragStart = function(e) {

            if (_Editor.GUIdragging) {

                _Editor.guiNodeDragEnd(e);
            } else {
                _Editor.GUIdragging = true;
                $('#guioverlay_index-vwf').on('mousemove', _Editor.guiNodeDraged);
                $('#guioverlay_index-vwf').on('mousedown', _Editor.guiNodeDragEnd);
                $('#guioverlay_index-vwf').css('pointer-events', 'all');


            }
            e.stopImmediatePropagation();
            return false;
        }
        this.guiNodeDraged = function(e) {

            if (_Editor.GUIdragging) {

                var val = Engine.getProperty(_Editor.GetSelectedVWFID(), 'transform');
                val[12] = e.clientX - 5;
                val[13] = e.clientY - 5;

                var div = '#guioverlay_' + Engine.parent(_Editor.GetSelectedVWFID());
                if (!$(div)[0])
                    div = $('#guioverlay_' + _Editor.GetSelectedVWFID()).parent()[0];
                var l = $(div).offset().left;
                var t = $(div).offset().top;
                val[12] -= l ;
                val[13] -= t  ;

                val[12] /=  $(div).width() || 1;
                val[13] /=  $(div).height() || 1;

                val[12] *= 100;
                val[13] *= 100;
                this.setProperty(_Editor.GetSelectedVWFID(), 'transform', matcpy(val))
            }
            e.stopImmediatePropagation();
            return false;
        }.bind(this)
        this.guiNodeDragEnd = function(e) {
            _Editor.GUIdragging = false;
            $('#guioverlay_index-vwf').off('mousemove', _Editor.guiNodeDraged);
            $('#guioverlay_index-vwf').css('pointer-events', 'none');
            $('#guioverlay_index-vwf').off('mousedown', _Editor.guiNodeDragEnd);
        }.bind(this)
        this.guiNodePick = function(e) {
            if (SelectMode == 'TempPick') {
                if (_Editor.TempPickCallback)
                    _Editor.TempPickCallback(this.vwfID);
            } else
                _Editor.SelectObject(this.vwfID);

            e.stopImmediatePropagation();
            return false;
        }
        this.bindGuiNodePick = function() {

            $('.guinode').addClass('guipick');
            $('.guinode').on('mouseup', this.guiNodePick);
            $('.guinode').on('mousedown', this.guiNodePick);
            $('.guinode').on('click', this.guiNodePick);
        }
        this.unbindGuiNodePick = function() {
            $('.guinode').removeClass('guipick');
            $('.guinode').off('mouseup', this.guiNodePick)
            $('.guinode').off('mousedown', this.guiNodePick)
            $('.guinode').off('click', this.guiNodePick);
        }
        this.SetSelectMode = function(e) {
            SelectMode = e;
            $('#StatusPickMode').html(('Pick: ' + e).escape());
            if (e == 'Pick') {
                //$('#MenuSelectPickicon').addClass('iconselected')
                $('#glyphOverlay').show();

            } else {

                //$('#MenuSelectPickicon').removeClass('iconselected')
                $('#glyphOverlay').hide();

            }
            if (SelectMode == 'TempPick') {
                $('#index-vwf').css('cursor', 'crosshair');

            } else {
                $('#index-vwf').css('cursor', 'default');

            }
            if (SelectMode == "Pick" || SelectMode == "TempPick") {
                this.bindGuiNodePick();
            } else {
                this.unbindGuiNodePick();
            }
        }.bind(this);
        this.SetCoordSystem = function(e) {
            CoordSystem = e;
            if (e == WorldCoords) {
                $('#StatusCoords').html(('World Coords').escape());
				setTimeout(function(){
					angularapp.root.fields.coordSpaceSelected = 'world';
					angularapp.root.$apply();
				}, 0);
            } else {
                $('#StatusCoords').html(('Local Coords').escape());
				setTimeout(function(){
					angularapp.root.fields.coordSpaceSelected = 'local';
					angularapp.root.$apply();
				}, 0);
            }
        }.bind(this);
        this.GetMoveGizmo = function(e) {
            return MoveGizmo;
        }.bind(this);
        this.SetSnaps = function(m, r, s) {
            RotateSnap = r;
            MoveSnap = m;
            ScaleSnap = s;
            $('#StatusSnaps').html(('Snaps: ' + (r / 0.0174532925) + 'deg, ' + m + 'm, ' + s + '%').escape());
        }.bind(this);
        this.GetSelectedVWFID = function(i) {
            if(!i)
                return this.SelectedVWFID;
            else
                return SelectedVWFNodes[i].id;
        }
        this.CallCreateNodeCallback = function(c, p, n) {
            try {
                this.createNodeCallback(c, p, n);
            } catch (e) {
                //console.log(e);
            }
        }
        this.SetCreateNodeCallback = function(callback) {
            this.createNodeCallback = callback;
        }
        this.SelectOnNextCreate = function(names) {

            this.toSelect = names;
            this.tempSelect = [];

            this.SetCreateNodeCallback(function(c, p, n) {
                if (self.toSelect.indexOf(n) >= 0) {
                    self.tempSelect.push(c);
                    self.toSelect.splice(self.toSelect.indexOf(n), 1);
                    if (self.toSelect.length == 0) {
                        self.createNodeCallback = null;
                        self.SelectObject(self.tempSelect, NewSelect);
                    }
                }
            });
        }
        this.GetSelectedVWFNode = function(idx) {
            if (idx === undefined) idx = 0;
            try {
                if (SelectedVWFNodes[idx]) return _Editor.getNode(SelectedVWFNodes[idx].id);
            } catch (e) {
                return null;
            }
        }.bind(this);
        this.findscene = function() {
            return Engine.views[0].state.scenes["index-vwf"].threeScene;
        }
        this.findcamera = function() {
            try {
                return _dView.getCamera();
            } catch (e) {
                return null;
            }
        }

        function matcpy(mat) {
            var newmat = [];
            for (var i = 0; i < 16; i++) newmat[i] = mat[i];
            return newmat;
        }
        this.getViewProjection = function() {
            var cam = this.findcamera();
            cam.matrixWorldInverse.getInverse(cam.matrixWorld);
            var _viewProjectionMatrix = new THREE.Matrix4();
            _viewProjectionMatrix.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
            return MATH.transposeMat4(_viewProjectionMatrix.toArray([]));
        }

        function toGMat(threemat) {
            var mat = [];
            mat = matcpy(threemat.elements);
            mat = (MATH.transposeMat4(mat));
            return mat;
        }
        this.buildContextMenu = function() {
            $(document.body).append('<div id="ContextMenu" />');
            $('#ContextMenu').append('<div id="ContextMenuName" style="border-bottom: 3px solid gray;">name</div>');
            $('#ContextMenu').append('<div id="ContextMenuActions" style="border-bottom: 2px gray dotted;"></div>');
            $('#ContextMenu').append('<div id="ContextMenuSelect" class="ContextMenuItem" style="border-bottom: 1px solid gray;">Select</div>');
            $('#ContextMenu').append('<div id="ContextMenuSelectNone" class="ContextMenuItem" style="border-bottom: 1px solid gray;" >Select None</div>');
            $('#ContextMenu').append('<div id="ContextMenuMove" class="ContextMenuItem">Move</div>');
            $('#ContextMenu').append('<div id="ContextMenuRotate" class="ContextMenuItem">Rotate</div>');
            $('#ContextMenu').append('<div id="ContextMenuScale" class="ContextMenuItem" style="border-bottom: 1px solid gray;">Scale</div>');
            $('#ContextMenu').append('<div id="ContextMenuFocus" class="ContextMenuItem" style="border-bottom: 1px solid gray;" >Focus</div>');
            $('#ContextMenu').append('<div id="ContextMenuCopy" class="ContextMenuItem">Copy</div>');
            $('#ContextMenu').append('<div id="ContextMenuPaste" class="ContextMenuItem">Paste</div>');
            $('#ContextMenu').append('<div id="ContextMenuDuplicate" class="ContextMenuItem" style="border-bottom: 1px solid gray;">Duplicate</div>');
            $('#ContextMenu').append('<div id="ContextMenuDelete" class="ContextMenuItem" style="border-bottom: 1px solid gray;">Delete</div>');
            //$('#ContextMenu').append('<div id="ContextMenuWires" class="ContextMenuItem" style="border-bottom: 1px solid gray;">Wire Properties</div>');
            $('#ContextMenu').disableSelection();
            $('#ContextMenuSelect').click(function() {
                self.SelectObject($('#ContextMenuName').attr('VWFID'));
                $('#ContextMenu').hide();
                $('#ContextMenu').css('z-index', '-1');
                $(".ddsmoothmenu").find('li').trigger('mouseleave');
                $('#index-vwf').focus();
            });
            $('#ContextMenuWires').click(function() {
                self.SelectObject($('#ContextMenuName').attr('VWFID'));
                $('#ContextMenu').hide();
                $('#ContextMenu').css('z-index', '-1');
                $(".ddsmoothmenu").find('li').trigger('mouseleave');
                $('#index-vwf').focus();
                _WireEditor.Show();
            });
            $('#ContextMenuSelectNone').click(function() {
                self.SelectObject(null);

                $('#ContextMenu').hide();
                $('#ContextMenu').css('z-index', '-1');
                $(".ddsmoothmenu").find('li').trigger('mouseleave');
                $('#index-vwf').focus();
            });
            $('#ContextMenuMove').click(function() {
                $('#MenuMove').click();
                $('#ContextMenu').hide();
                $('#ContextMenu').css('z-index', '-1');
                $(".ddsmoothmenu").find('li').trigger('mouseleave');
                $('#index-vwf').focus();
            });
            $('#ContextMenuRotate').click(function() {
                $('#MenuRotate').click();
                $('#ContextMenu').hide();
                $('#ContextMenu').css('z-index', '-1');
                $(".ddsmoothmenu").find('li').trigger('mouseleave');
                $('#index-vwf').focus();
            });
            $('#ContextMenuScale').click(function() {
                $('#MenuScale').click();
                $('#ContextMenu').hide();
                $('#ContextMenu').css('z-index', '-1');
                $(".ddsmoothmenu").find('li').trigger('mouseleave');
                $('#index-vwf').focus();
            });
            $('#ContextMenuFocus').click(function() {
                $('#MenuFocusSelected').click();
                $('#ContextMenu').hide();
                $('#ContextMenu').css('z-index', '-1');
                $(".ddsmoothmenu").find('li').trigger('mouseleave');
                $('#index-vwf').focus();
            });
            $('#ContextMenuCopy').click(function() {
                $('#MenuCopy').click();
                $('#ContextMenu').hide();
                $('#ContextMenu').css('z-index', '-1');
                $(".ddsmoothmenu").find('li').trigger('mouseleave');
                $('#index-vwf').focus();
            });
            $('#ContextMenuPaste').click(function(e) {
                self.Paste(true);
                $('#ContextMenu').hide();
                $('#ContextMenu').css('z-index', '-1');
            });
            $('#ContextMenuDuplicate').click(function() {
                $('#MenuDuplicate').click();
                $('#ContextMenu').hide();
                $('#ContextMenu').css('z-index', '-1');
                $(".ddsmoothmenu").find('li').trigger('mouseleave');
                $('#index-vwf').focus();
            });
            $('#ContextMenuDelete').click(function() {
                $('#MenuDelete').click();
                $('#ContextMenu').hide();
                $('#ContextMenu').css('z-index', '-1');
                $(".ddsmoothmenu").find('li').trigger('mouseleave');
                $('#index-vwf').focus();
            });
        }
        this.getDefaultMaterial = function() {
            var currentmat = new THREE.MeshPhongMaterial();
            currentmat.color.r = 1;
            currentmat.color.g = 1;
            currentmat.color.b = 1;
            currentmat.ambient.r = 1;
            currentmat.ambient.g = 1;
            currentmat.ambient.b = 1;
            currentmat.emissive.r = 0;
            currentmat.emissive.g = 0;
            currentmat.emissive.b = 0;
            currentmat.specular.r = .5;
            currentmat.specular.g = .5;
            currentmat.specular.b = .5;
            currentmat.map = THREE.ImageUtils.loadTexture('checker.jpg');
            return currentmat;
        }
        this.getDefForMaterial = function(currentmat) {
            try {
                var value = {};
                value.color = {}
                value.color.r = currentmat.color.r;
                value.color.g = currentmat.color.g;
                value.color.b = currentmat.color.b;
                value.ambient = {}
                value.ambient.r = currentmat.ambient.r;
                value.ambient.g = currentmat.ambient.g;
                value.ambient.b = currentmat.ambient.b;
                value.emit = {}
                value.emit.r = currentmat.emissive.r;
                value.emit.g = currentmat.emissive.g;
                value.emit.b = currentmat.emissive.b;
                value.specularColor = {}
                value.specularColor.r = currentmat.specular.r;
                value.specularColor.g = currentmat.specular.g;
                value.specularColor.b = currentmat.specular.b;
                value.specularLevel = 1;
                value.alpha = currentmat.alpha;

                value.reflect = currentmat.reflectivity * 10;
                var mapnames = ['map', 'bumpMap', 'lightMap', 'normalMap', 'specularMap', 'envMap'];
                value.layers = [];
                for (var i = 0; i < mapnames.length; i++) {
                    var map = currentmat[mapnames[i]];
                    if (map) {
                        value.layers.push({});
                        value.layers[value.layers.length - 1].mapTo = i + 1;
                        value.layers[value.layers.length - 1].scalex = map.repeat.x;
                        value.layers[value.layers.length - 1].scaley = map.repeat.y;
                        value.layers[value.layers.length - 1].offsetx = map.offset.x;
                        value.layers[value.layers.length - 1].offsety = map.offset.y;
                        if (i == 1) value.layers[value.layers.length - 1].alpha = -currentmat.alphaTest + 1;
                        if (i == 4) value.layers[value.layers.length - 1].alpha = currentmat.normalScale.x;
                        if (i == 2) value.layers[value.layers.length - 1].alpha = currentmat.bumpScale;
                        value.layers[i].src = map.image.src;
                        if (map.mapping instanceof THREE.UVMapping) value.layers[value.layers.length - 1].mapInput = 0;
                        if (map.mapping instanceof THREE.CubeReflectionMapping) value.layers[value.layers.length - 1].mapInput = 1;
                        if (map.mapping instanceof THREE.CubeRefractionMapping) value.layers[value.layers.length - 1].mapInput = 2;
                        if (map.mapping instanceof THREE.SphericalReflectionMapping) value.layers[value.layers.length - 1].mapInput = 3;
                        if (map.mapping instanceof THREE.SphericalRefractionMapping) value.layers[value.layers.length - 1].mapInput = 4;
                    }
                }
                return value;
            } catch (e) {
                return this.getDefaultMaterial();
            }
        }
        this.setMaterialByDef = function(currentmat, value) {
            currentmat.color.r = value.color.r;
            currentmat.color.g = value.color.g;
            currentmat.color.b = value.color.b;
            currentmat.ambient.r = value.ambient.r;
            currentmat.ambient.g = value.ambient.g;
            currentmat.ambient.b = value.ambient.b;
            currentmat.emissive.r = value.emit.r;
            currentmat.emissive.g = value.emit.g;
            currentmat.emissive.b = value.emit.b;
            currentmat.specular.r = value.specularColor.r * value.specularLevel;
            currentmat.specular.g = value.specularColor.g * value.specularLevel;
            currentmat.specular.b = value.specularColor.b * value.specularLevel;
            currentmat.opacity = value.alpha;
            if (value.alpha < 1) currentmat.transparent = true;
            else currentmat.transparent = false;
            currentmat.shininess = value.shininess * 5;
            var mapnames = ['map', 'bumpMap', 'lightMap', 'normalMap', 'specularMap', 'envMap'];
            currentmat.reflectivity = value.reflect / 10;
            for (var i = 0; i < value.layers.length; i++) {
                var mapname;
                if (value.layers[i].mapTo == 1) {
                    mapname = 'map';
                    currentmat.alphaTest = 1 - value.layers[i].alpha;

                }
                if (value.layers[i].mapTo == 2) {
                    mapname = 'bumpMap';
                    currentmat.bumpScale = value.layers[i].alpha;
                }
                if (value.layers[i].mapTo == 3) {
                    mapname = 'lightMap';
                }
                if (value.layers[i].mapTo == 4) {
                    mapname = 'normalMap';
                    currentmat.normalScale.x = value.layers[i].alpha;
                    currentmat.normalScale.y = value.layers[i].alpha;
                }
                if (value.layers[i].mapTo == 5) {
                    mapname = 'specularMap';
                }
                if (value.layers[i].mapTo == 6) {
                    mapname = 'envMap';
                }
                mapnames.splice(mapnames.indexOf(mapname), 1);
                String.prototype.endsWith = function(suffix) {
                    return this.indexOf(suffix, this.length - suffix.length) !== -1;
                };
                if ((currentmat[mapname] && currentmat[mapname].image && !currentmat[mapname].image.src.toString().endsWith(value.layers[i].src)) || !currentmat[mapname]) {
                    currentmat[mapname] = THREE.ImageUtils.loadTexture(value.layers[i].src);
                }
                if (value.layers[i].mapInput == 0) {
                    currentmat[mapname].mapping = new THREE.UVMapping();
                }
                if (value.layers[i].mapInput == 1) {
                    currentmat[mapname].mapping = new THREE.CubeReflectionMapping();
                }
                if (value.layers[i].mapInput == 2) {
                    currentmat[mapname].mapping = new THREE.CubeRefractionMapping();
                }
                if (value.layers[i].mapInput == 3) {
                    currentmat[mapname].mapping = new THREE.SphericalReflectionMapping();
                }
                if (value.layers[i].mapInput == 4) {
                    currentmat[mapname].mapping = new THREE.SphericalRefractionMapping();
                }
                currentmat[mapname].wrapS = THREE.RepeatWrapping;
                currentmat[mapname].wrapT = THREE.RepeatWrapping;
                currentmat[mapname].repeat.x = value.layers[i].scalex;
                currentmat[mapname].repeat.y = value.layers[i].scaley;
                currentmat[mapname].offset.x = value.layers[i].offsetx;
                currentmat[mapname].offset.y = value.layers[i].offsety;

                //return currentmat;
            }
            for (var i in mapnames) {
                currentmat[mapnames[i]] = null;
            }
            if (currentmat.reflectivity) {
                var sky = vwf_view.kernel.kernel.callMethod('index-vwf', 'getSkyMat')
                currentmat.envMap = sky.uniforms.texture.value;
                currentmat.envMap.mapping = new THREE.CubeReflectionMapping();
            }
            currentmat.needsUpdate = true;
        }
        this.loadMesh = function(url, type) {
            var self = this;
            //ok, here, let's preload the asset. If there is an error during parse, the preloader will never hit the callback and
            // we won't end up with a broken VWF entity.
            _assetLoader.loadAssets([{
                type: type,
                url: url
            }], function() {

                var Proto = {
                    extends: 'asset.vwf',
                    source: url,
                    type: type || 'subDriver/threejs/asset/vnd.collada+xml',
                    properties: {
                        owner: _UserManager.GetCurrentUserName()
                    }
                };


                var newintersectxy = self.GetInsertPoint();
                Proto.properties.owner = _UserManager.GetCurrentUserName();
                Proto.properties.transform = MATH.transposeMat4(MATH.translateMatrix(newintersectxy));
                var newname = self.GetUniqueName(url);
                Proto.properties.DisplayName = newname;
                var guid = GUID();
                _UndoManager.recordCreate('index-vwf', guid, Proto);
                vwf_view.kernel.createChild('index-vwf', guid, Proto);


            }, true)


        }
        this.focusSelected = function() {
            helper( _Editor.GetSelectedVWFID() );

            function helper(focusID)
            {
                if( !focusID ){
                    return;
                }
                else if(_Editor.findviewnode(focusID)) {

                    var t = _Editor.GetMoveGizmo().getGizmoHead().matrixWorld.getPosition();
                    var gizpos = [t.x, t.y, t.z];
                    var matrix = _Editor.findviewnode(focusID).matrixWorld.elements;
                    matrix = MATH.transposeMat4(matrix);
                    var box = _Editor.findviewnode(focusID).GetBoundingBox(true);
                    box = box.transformBy(matrix);

                    if (box && box.max.indexOf(-Infinity) == -1 && box.min.indexOf(Infinity) == -1)
                        var dist = Math.max(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]) + 2;
                    else
                        dist = 3;

                    require("vwf/view/threejs/editorCameraController").getController('Orbit').orbitPoint(gizpos);
                    require("vwf/view/threejs/editorCameraController").getController('Orbit').zoom = dist;
                    require("vwf/view/threejs/editorCameraController").setCameraMode('Orbit');
                    require("vwf/view/threejs/editorCameraController").updateCamera();
                    box.release();

                }
                else {
                    helper( Engine.parent(focusID) );
                }
            }
        }
        this.updateGizmo = function()
        {
            this.updateGizmoSize();
            this.updateGizmoOrientation();
            this.updateGizmoLocation();
        }
        this.initialize = function() {
            this.BuildMoveGizmo();
            this.SelectObject(null, 2, true);
            _dView.bind('prerender', this.updateGizmo.bind(this));
            $('#vwf-root').on('contextmenu', function() {
                return false;
            });
            this.SelectionBoundsContainer = new THREE.Object3D();
            this.SelectionBoundsContainer.name = "SelectionBoundsContainer";
            this.findscene().add(this.SelectionBoundsContainer, true);
            this.SelectionBoundsContainer.InvisibleToCPUPick = true;
            this.buildContextMenu();
            this.mouseDownScreenPoint = [0, 0];
            this.mouseUpScreenPoint = [0, 0];
            $(document.body).append('<div id="selectionMarquee" />');
            this.selectionMarquee = $('#selectionMarquee');
            this.selectionMarquee.css('position', 'absolute');
            this.selectionMarquee.css('width', '100');
            this.selectionMarquee.css('height', '100');
            this.selectionMarquee.css('top', '100');
            this.selectionMarquee.css('left', '100');
            this.selectionMarquee.css('z-index', '100');
            this.selectionMarquee.css('border', '2px dotted darkslategray');
            this.selectionMarquee.css('pointer-events', 'all');
            this.selectionMarquee.css('border-radius', '5px');
            //this.selectionMarquee.css('box-shadow','0px 0px 10px lightgray, 0px 0px 10px lightgray inset');
            this.selectionMarquee.mousedown(function(e) {
                self.mousedown(e);
                e.preventDefault();
                e.stopPropagation();
                return false;
            });
            this.selectionMarquee.mouseup(function(e) {
                self.mouseup(e);
                e.preventDefault();
                e.stopPropagation();
                return false;
            });
            this.selectionMarquee.mousemove(function(e) {
                self.mousemove(e);
                e.preventDefault();
                e.stopPropagation();
                return false;
            });

            this.selectionMarquee.css('border', 'none');
            this.selectionMarquee.css('pointer-events', 'none');
            $('#ContextMenu').hide();
        }
        this.mousedown = function(e) {
            if (this.activeTool && this.activeTool.mousedown) this.activeTool.mousedown(e);
        }
        this.disableDueToWorldState =function()
        {
            if(_DataManager.getInstanceData().publishSettings.allowPlayPause == true || _DataManager.getInstanceData().publishSettings.allowPlayPause == undefined)
            {
                if (Engine.getProperty(Engine.application(), 'playMode') == 'play')
                    return true;
            }
            return false;
        }
        this.mouseup = function(e) {
            if (!toolsOpen()) return;
            if (_Editor.disableDueToWorldState()) return;
            if (this.activeTool && this.activeTool.mouseup) this.activeTool.mouseup(e);
        }
        this.click = function(e) {
            if (!toolsOpen()) return;
            if (_Editor.disableDueToWorldState()) return;
            if (this.activeTool && this.activeTool.click) this.activeTool.click(e);
        }
        this.dblclick = function(e) {
            if (!toolsOpen()) return;
            if (_Editor.disableDueToWorldState()) return;
            if (this.activeTool && this.activeTool.dblclick) this.activeTool.dblclick(e);
        }
        this.mousemove = function(e) {
            if (!toolsOpen()) return;
            if (_Editor.disableDueToWorldState()) return;
            if (this.activeTool && this.activeTool.mousemove) this.activeTool.mousemove(e);
        }
        this.mousewheel = function(e) {
            if (!toolsOpen()) return;
            if (_Editor.disableDueToWorldState()) return;
            if (this.activeTool && this.activeTool.mousewheel) this.activeTool.mousewheel(e);
        }
        this.keyup = function(e) {
            if (!toolsOpen()) return;
            if (_Editor.disableDueToWorldState()) return;
            if (this.activeTool && this.activeTool.keyup) this.activeTool.keyup(e);
        }
        this.keydown = function(e) {
            if (!toolsOpen()) return;
            if (_Editor.disableDueToWorldState()) return;
            if (this.activeTool && this.activeTool.keydown) this.activeTool.keydown(e);
        }
        this.createdNode = function(nodeID,childID) {

            if (!toolsOpen()) return;
            if (this.activeTool && this.activeTool.createdNode) this.activeTool.createdNode.apply(this.activeTool, arguments);

            //if a new node is created, and it's a GUI node, and we're in pick mode, it needs the pick events bound so it can be selected
            if (SelectMode == "Pick" || SelectMode == "TempPick") {
                //unbind so that we dont bind twice
                //the actual DOM objects are created by a different driver, higher on the stack.
                //need to give it a sec to get there
                window.setTimeout(function() {

                    _Editor.unbindGuiNodePick();
                    _Editor.bindGuiNodePick();

                }, 500)

            }
            if(window._RenderManager && Engine.getProperty(Engine.application(), 'playMode') !== 'play'){
                _RenderManager.flashHilightMult(findviewnode(childID));
                _RenderManager.flashHilightMult(findviewnode(nodeID));
            }

        }
        this.tools = {};
        this.addTool = function(name, tool) {
            this.tools[name] = tool;
        }
        this.addTool('Gizmo', {
            mousedown: this.mousedown_Gizmo,
            mouseup: this.mouseup_Gizmo,
            mousemove: this.mousemove_Gizmo,
            click: null,
            mousewheel: null,
            dblclick:this.dblclick_Gizmo,
            keydown: this.keydown_Gizmo,
            keyup: this.keyup_Gizmo
        });
        this.setActiveTool = function(str) {
            this.activeTool = this.tools[str];
        }
        this.setActiveTool('Gizmo');
        this.GetSelectionBounds = function() {
            return SelectionBounds;
        };
        this.Move = Move;
        this.Rotate = Rotate;
        this.Scale = Scale;
        this.Multi = Multi;
        this.CoordSystem = CoordSystem;
        this.WorldCoords = WorldCoords;
        this.ParentCoords = ParentCoords;
        this.LocalCoords = LocalCoords;
        this.MoveGizmo = MoveGizmo;
        this.RotateSnap = RotateSnap;
        this.MoveSnap = MoveSnap;
        this.ScaleSnap = ScaleSnap;
        this.WorldZ = WorldZ;
        this.WorldY = WorldY;
        this.WorldX = WorldX;
        this.GetCurrentZ = function() {
            return CurrentZ
        };
        this.GetCurrentY = function() {
            return CurrentY
        };
        this.GetCurrentX = function() {
            return CurrentX
        };
        this.GetSelectMode = function() {
            return SelectMode;
        }

        //$(document).bind('prerender',this.rt.bind(this));
    }
});
