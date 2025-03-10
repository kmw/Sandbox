
function MaterialCache() {
        this.materials = {};
        this.getMaterialbyDef = function(oldmat, def) {
            var id = JSON.stringify(def);
            //if oldmat is not null, then we are reusing a material because it is only used once
            if (this.materials[id])
                return this.materials[id];
            else {

                //this.materials[id].morphTargets  = true;
                if (def) {
                    if (oldmat) {
                        //because we are reusing the material, we need to remove it from the cache
                        delete this.materials[oldmat.def];
                    }
                    this.materials[id] = this.setMaterialByDef(oldmat, def);
                    if (this.materials[id])
                        this.materials[id].def = id;
                } else
                    return null;
                return this.materials[id];

            }
        }
        //assign the new material to the mesh, keep reference count of material use
        this.setMaterial = function(mesh, def) {



            var oldmat = mesh.material;
            var newmat = this.getMaterialbyDef(oldmat && oldmat.refCount == 1 ? oldmat : null, def);

            //test for shader compile fail, and set in simple mode if failed
            if( newmat){
                var testmats = [newmat];
                if(newmat.materials)
                    testmats = newmat.materials;
                var passed = true;
                for(var i in testmats)
                {
                    if (window._dRenderer)
                    {
                        _dRenderer.initMaterial(testmats[i], _dScene.__lights, _dScene.fog, mesh);
                        var status = _dRenderer.context.getProgramParameter(testmats[i].program.program, _dRenderer.context.LINK_STATUS);
                        passed = passed && status;
                    }
                }

                if ( !passed ) {
                    console.error('Error linking material, falling back');
                    //this line will cause the setting manager to remember the setting. lets not do that right now
                    //_SettingsManager.setKey('useSimpleMaterials',true);
                    _SettingsManager.settings['useSimpleMaterials'] = true;
                    newmat = this.getMaterialbyDef(oldmat && oldmat.refCount == 1 ? oldmat : null, def);
                }
            }

            if (oldmat == newmat) return;

            //so, since the loader now does not clone materails on load, it's possible that the material is shared by other meshes
            //even though we have not ref counted it. So, we can't dispose materials that have a refcount of undefined, since we have
            //no idea if they are used elsewhere. Only dispose when refcount === 0
            //if(oldmat && oldmat.refCount === undefined)
            //  oldmat.refCount = 1;
            if (oldmat && oldmat.refCount)
                oldmat.refCount--;
            if (oldmat.refCount === 0) {
                if (oldmat.dispose) {
                    var mapnames = ['bumpMap', 'normalMap', 'map', 'specularMap', 'lightMap'];
                    for (var i = 0; i < mapnames.length; i++) {
                        if (oldmat[mapnames[i]] && oldmat[mapnames[i]].dispose) {
                            oldmat[mapnames[i]].dispose();
                        }
                    }
                    //if we are disposing, then we know that this material was allocated by the materialdef system. Since this system does not
                    //cache maps independantly of materails, we can dispose all the maps as well.
                    oldmat.dispose();
                }
                var olddef = oldmat.def;
                delete this.materials[olddef];
            }
            //make sure that we update the material to have enough submats for all the requested IDs
            if(newmat instanceof THREE.MeshFaceMaterial && mesh.geometry && mesh.geometry.faces)
            {
                
                var maxIndex = 0;
                for (var j = 0; j < mesh.geometry.faces.length; j++)
                {
                    maxIndex = Math.max(maxIndex,mesh.geometry.faces[j].materialIndex);
                }
                for(var j = 0; j < maxIndex +1; j++)
                    if(!newmat.materials[j])
                        newmat.materials[j] = newmat.materials[0];
                mesh.geometry.groupsNeedUpdate = true
            }
            mesh.material = newmat;
            

            if (mesh.material && mesh.material.refCount === undefined)
                mesh.material.refCount = 0;
            if (mesh.material)
                mesh.material.refCount++;
            this.cleanup();
        }
        //remove materials that are not used by any meshes
        this.cleanup = function() {
            for (var i in this.materials) {
                if (this.materials[i] && this.materials[i].refCount === 0)
                    delete this.materials[i];
                if (!this.materials[i])
                    delete this.materials[i];
            }
        }
        this.setMaterialByDef = function(currentmat, value) {
            if (!value) return null;
            if (!value.type && !(value instanceof Array))
                value.type = 'phong';

            if (value.type == 'phong') {
                if (_SettingsManager.getKey('useSimpleMaterials'))
                    return this.setMaterialDefSimple(currentmat, value);
                return this.setMaterialDefPhong(currentmat, value);
            } else if (value.type == 'video')
                return this.setMaterialDefVideo(currentmat, value)
            else if (value.type == 'camera')
                return this.setMaterialDefCamera(currentmat, value)
            else if (value.type == 'mix')
                return this.setMaterialDefMix(currentmat, value);
            else if (value.type == 'fresnel')
                return this.fresnelShader(currentmat, value);
            else if (value instanceof Array)
                return this.setMaterialDefMultiFace(currentmat,value)
        }

        this.setMaterialDefMultiFace = function(currentmat,value)
        {
            
            if (currentmat && !(currentmat instanceof THREE.MeshFaceMaterial)) {
                 if (currentmat && currentmat.dispose)
                        currentmat.dispose();
                 currentmat = null;
            }
            if(!currentmat) {
                currentmat = new THREE.MeshFaceMaterial()
            }
            for(var i = 0; i < value.length; i++)
            {
                currentmat.materials[i] = this.setMaterialByDef(currentmat.materials[i],value[i])
            }
            return currentmat;
        }
        this.fresnelShader = function(currentmat, value) {
            if (currentmat && currentmat.dispose)
                currentmat.dispose();

            if (currentmat && !(currentmat instanceof THREE.ShaderMaterial)) {
                currentmat = null;
            }
            if (!currentmat) {
                currentmat = new THREE.ShaderMaterial({
                    uniforms: {

                        "mRefractionRatio": { type: "f", value: 1.02 },
                        "mFresnelBias": { type: "f", value: 0.1 },
                        "mFresnelPower": { type: "f", value: 2.0 },
                        "mFresnelScale": { type: "f", value: 1.0 },
                        "tCube": { type: "t", value: null }

                    },

                    vertexShader: [

                        "uniform float mRefractionRatio;",
                        "uniform float mFresnelBias;",
                        "uniform float mFresnelScale;",
                        "uniform float mFresnelPower;",

                        "varying vec3 vReflect;",
                        "varying vec3 vRefract[3];",
                        "varying float vReflectionFactor;",

                        "void main() {",

                        "vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );",
                        "vec4 worldPosition = modelMatrix * vec4( position, 1.0 );",

                        "vec3 worldNormal = normalize( mat3( modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz ) * normal );",

                        "vec3 I = worldPosition.xyz - cameraPosition;",

                        "vReflect = reflect( I, worldNormal );",
                        "vRefract[0] = refract( normalize( I ), worldNormal, mRefractionRatio );",
                        "vRefract[1] = refract( normalize( I ), worldNormal, mRefractionRatio * 0.99 );",
                        "vRefract[2] = refract( normalize( I ), worldNormal, mRefractionRatio * 0.98 );",
                        "vReflectionFactor = mFresnelBias + mFresnelScale * pow( 1.0 + dot( normalize( I ), worldNormal ), mFresnelPower );",

                        "gl_Position = projectionMatrix * mvPosition;",

                        "}"

                    ].join("\n"),

                    fragmentShader: [

                        "uniform samplerCube tCube;",

                        "varying vec3 vReflect;",
                        "varying vec3 vRefract[3];",
                        "varying float vReflectionFactor;",

                        "void main() {",

                        "vec4 reflectedColor = textureCube( tCube, vec3( -vReflect.x, vReflect.yz ) );",
                        "vec4 refractedColor = vec4( 1.0 );",

                        "refractedColor.r = textureCube( tCube, vec3( -vRefract[0].x, vRefract[0].yz ) ).r;",
                        "refractedColor.g = textureCube( tCube, vec3( -vRefract[1].x, vRefract[1].yz ) ).g;",
                        "refractedColor.b = textureCube( tCube, vec3( -vRefract[2].x, vRefract[2].yz ) ).b;",

                        "gl_FragColor = mix( refractedColor, reflectedColor, clamp( vReflectionFactor, 0.0, 1.0 ) );",

                        "}"
                    ].join("\n")
                });
            }
            currentmat.dispose = function() {
                _dView.deleteRenderTarget(this.renderTarget);
            }.bind(currentmat);


            if (currentmat.renderTarget) {
                _dView.deleteRenderTarget(currentmat.renderTarget);
            }

            currentmat.uniforms.mRefractionRatio.value = value.RefractionRatio;
            currentmat.uniforms.mFresnelBias.value = value.FresnelBias;
            currentmat.uniforms.mFresnelPower.value = value.FresnelPower;
            currentmat.uniforms.mFresnelScale.value = value.FresnelScale;

            if (!value.fresnelsrc) {
                currentmat.uniforms[ "tCube" ].value = vwf_view.kernel.kernel.callMethod(Engine.application(), 'getSkyMat')
            } else {
                currentmat.uniforms[ "tCube" ].value = value.fresnelsrc;
            }

            if (value.fresnelside == 1) {
                currentmat.side = THREE.BackSide;
            } else {
                currentmat.side = THREE.FrontSide;
            }

            currentmat.needsUpdate = true;

            return currentmat;
        }



        this.setMaterialDefVideo = function(currentmat, value) {

            if (currentmat && currentmat.dispose)
                currentmat.dispose();

            if (currentmat && !(currentmat instanceof THREE.ShaderMaterial)) {
                currentmat = null;
            }

            if (!currentmat) {

                //startColor:{type: "v4", value:new THREE.Vector4(1,1,1,1)},
                currentmat = new THREE.ShaderMaterial({
                    uniforms: {
                        color: {
                            type: "v4",
                            value: new THREE.Vector4(1, 1, 1, 1)
                        },
                        texture1: {
                            type: "t",
                            value: null
                        }
                    },
                    attributes: {},
                    vertexShader: "varying vec2 tc;" +
                        "void main() {    " +
                        "    gl_Position = modelViewMatrix * vec4( position, 1.0 );\n" +
                        "    gl_Position = projectionMatrix * gl_Position;\n" +
                        "    tc = uv;" +
                        "} ",
                    fragmentShader: "uniform vec4 color; " +
                        "uniform sampler2D texture1;" +
                        "varying vec2 tc;" +
                        "void main() { " +
                        "vec4 color1 = texture2D(texture1,tc);" +
                        "gl_FragColor = color1;" +
                        "gl_FragColor.a = 1.0;" +

                    "}"

                });


            }


            currentmat.dispose = function() {;
                $(document).unbind('prerender', this.videoUpdateCallback);
                delete this.videoUpdateCallback;
                if (this.video)
                    this.video.pause();
                delete this.video;
            }.bind(currentmat);

            if (currentmat.videoUpdateCallback) {
                _dView.unbind('prerender', currentmat.videoUpdateCallback);
                delete currentmat.videoUpdateCallback;
            }

            if (!currentmat.videoUpdateCallback) {
                currentmat.videoUpdateCallback = function() {

                    if (this.uniforms.texture1.value.image.readyState === this.uniforms.texture1.value.image.HAVE_ENOUGH_DATA) {
                        this.uniforms.texture1.value.needsUpdate = true;
                    }

                }.bind(currentmat);

                _dView.bind('prerender', currentmat.videoUpdateCallback.bind(currentmat));

            }
            if (value.layers[0]) {
                var src = value.videosrc;
                var video = document.createElement('video');

                video.setAttribute('crossorigin', "anonymous");
                video.autoplay = true;
                video.loop = true;

                video.src = src;
                video.onload = function() {
                    this.play();
                };
                //document.body.appendChild(video);
                //video.style.zIndex = 1000;
                //video.style.position = 'absolute';

                currentmat.video = video;
                currentmat.uniforms.texture1.value = new THREE.Texture(video);
                currentmat.uniforms.texture1.value.minFilter = THREE.NearestFilter;
                currentmat.uniforms.texture1.value.magFilter = THREE.NearestFilter;
                currentmat.uniforms.texture1.value.format = THREE.RGBFormat;
                currentmat.uniforms.texture1.value.generateMipmaps = false;
            }
            return currentmat;
        }
        this.setMaterialDefCamera = function(currentmat, value) {

            if (currentmat && currentmat.dispose)
                currentmat.dispose();

            if (currentmat && !(currentmat instanceof THREE.ShaderMaterial)) {

                currentmat = null;
            }

            if (!currentmat) {

                //startColor:{type: "v4", value:new THREE.Vector4(1,1,1,1)},
                currentmat = new THREE.ShaderMaterial({
                    uniforms: {

                        texture1: {
                            type: "t",
                            value: _SceneManager.getTexture('./checker.jpg')
                        }
                    },
                    attributes: {},
                    vertexShader: "varying vec2 tc;" +
                        "void main() {    " +
                        "    gl_Position = modelViewMatrix * vec4( position, 1.0 );\n" +
                        "    gl_Position = projectionMatrix * gl_Position;\n" +
                        "    tc = uv;" +
                        "} ",
                    fragmentShader: "uniform sampler2D texture1;" +
                        "varying vec2 tc;" +
                        "void main() { " +
                        "vec4 color1 = texture2D(texture1,tc,0.0);" +

                    "gl_FragColor = color1;" +

                    "}"

                });


            }


            currentmat.dispose = function() {
                _dView.deleteRenderTarget(this.renderTarget);
            }.bind(currentmat);



            if (currentmat.renderTarget) {
                _dView.deleteRenderTarget(currentmat.renderTarget);
            }

            var cameraID = value.RTTCameraID;
            if (cameraID)
                currentmat.uniforms.texture1.value = _dView.createRenderTarget(cameraID);

            currentmat.renderTarget = currentmat.uniforms.texture1.value;
            //currentmat.uniforms.texture1.value.minFilter = THREE.LinearFilter;
            //currentmat.uniforms.texture1.value.magFilter = THREE.LinearFilter;

            currentmat.uniforms.texture1.value.generateMipmaps = true;


            return currentmat;
        }
        this.setMaterialDefPhong = function(currentmat, value) {
            if (!value) return;



            if (currentmat && !(currentmat instanceof THREE.MeshPhongMaterial)) {
                if (currentmat && currentmat.dispose)
                    currentmat.dispose();
                currentmat = null;
            }

            if (!currentmat) {
                currentmat = new THREE.MeshPhongMaterial();
                currentmat.needsUpdate = true;
            }

            currentmat.color.r = value.color.r;
            currentmat.color.g = value.color.g;
            currentmat.color.b = value.color.b;

            currentmat.ambient.r = value.ambient.r;
            currentmat.ambient.g = value.ambient.g;
            currentmat.ambient.b = value.ambient.b;

            currentmat.emissive.r = value.emit.r;
            currentmat.emissive.g = value.emit.g;
            currentmat.emissive.b = value.emit.b;

            currentmat.morphTargets = value.morphTargets || false;
            currentmat.skinning = value.skinning || false;

            if(value.specularLevel > 1)
                value.specularLevel /= Math.pow(10, Math.ceil(Math.log10(value.specularLevel)));
            else if(value.specularLevel < 0)
                value.specularLevel = 0;

            currentmat.specular.r = value.specularColor.r * value.specularLevel;
            currentmat.specular.g = value.specularColor.g * value.specularLevel;
            currentmat.specular.b = value.specularColor.b * value.specularLevel;

            currentmat.side = value.side || 0;
            if (window.isIE() && currentmat.side == 2) currentmat.side = 0;
            currentmat.opacity = value.alpha;
            //if the alpha value less than 1, and the blendmode is defined but not noblending
            if (value.blendMode !== THREE.NoBlending) {

                if (value.alpha < 1)
                {
                    if (currentmat.transparent == false) currentmat.needsUpdate = true;
                    currentmat.transparent = true;
                }
                else
                {
                    if (currentmat.transparent == true) currentmat.needsUpdate = true;
                    currentmat.transparent = false;
                }

            } else {

                if (currentmat.transparent == true) currentmat.needsUpdate = true;
                currentmat.transparent = false;
            }

            if (value.blendMode !== undefined) {
                if (currentmat.blending != value.blendMode) currentmat.needsUpdate = true;
                currentmat.blending = value.blendMode;
            }
            if (value.fog !== undefined) {
                if (currentmat.fog != value.fog) currentmat.needsUpdate = true;
                currentmat.fog = value.fog;
            }
            
            value.wireframe = value.wireframe || false;
            value.metal = value.metal || false;
            value.combine = value.combine || 0;

            

            if (currentmat.wireframe != value.wireframe) currentmat.needsUpdate = true;
            if (currentmat.metal != value.metal) currentmat.needsUpdate = true;
            if (currentmat.combine != value.combine) currentmat.needsUpdate = true;

            currentmat.wireframe = value.wireframe;
            currentmat.metal = value.metal;
            currentmat.combine = value.combine;

            //in most recent chrome and threejs , add .0001 because 0 causes error in shader
            currentmat.shininess = (value.shininess * 5) + .0001;

            if(value.depthtest == undefined)
                    value.depthtest = true; 
            if (currentmat.depthTest != value.depthtest) currentmat.needsUpdate = true;
            if (value.depthtest === true) {
                currentmat.depthTest = true;
            } else {
                currentmat.depthTest = false;
            }

            if(value.depthwrite == undefined) value.depthwrite = true;
            
            if (currentmat.depthWrite != value.depthwrite) currentmat.needsUpdate = true;
            if (value.depthwrite === true ) {
                currentmat.depthWrite = true;
            } else {
                currentmat.depthWrite = false;
            }


            if (value.vertexColors === true) {
                if (currentmat.vertexColors != 2) currentmat.needsUpdate = true;
                currentmat.vertexColors = 2;
            } else {
                if (currentmat.vertexColors != 0) currentmat.needsUpdate = true;
                currentmat.vertexColors = 0;
            }

            var mapnames = ['map', 'lightMap', 'specularMap', 'envMap', 'alphaMap'];
            if (window._dRenderer && _dRenderer.supportsStandardDerivatives()) {
                mapnames.push('normalMap');
                mapnames.push('bumpMap');

            }

            if(value.reflect > 1)
                value.reflect /= Math.pow(10, Math.ceil(Math.log10(value.reflect)));
            else if(value.reflect < 0)
                value.reflect = 0;

            currentmat.reflectivity = value.reflect;


            for (var i = 0; i < value.layers.length; i++) {
                var mapname = null;
                if (value.layers[i].mapTo == 1) {
                    mapname = 'map';
                    currentmat.alphaTest = 1 - value.layers[i].alpha;

                }
                if (window._dRenderer && value.layers[i].mapTo == 2 && _dRenderer.supportsStandardDerivatives()) {
                    mapname = 'bumpMap';
                    currentmat.bumpScale = value.layers[i].alpha / 10.0;
                }
                if (value.layers[i].mapTo == 3) {
                    mapname = 'lightMap';
                }
                if (window._dRenderer && value.layers[i].mapTo == 4 && _dRenderer.supportsStandardDerivatives()) {
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
                if (value.layers[i].mapTo == 7) {
                    mapname = 'alphaMap';
                }

                if (mapname) {
                    mapnames.splice(mapnames.indexOf(mapname), 1);

                    String.prototype.endsWith = function(suffix) {
                        return this.indexOf(suffix, this.length - suffix.length) !== -1;
                    };

                    if ((currentmat[mapname] && currentmat[mapname]._SMsrc != value.layers[i].src) || !currentmat[mapname]) {
                        _SceneManager.releaseTexture(currentmat[mapname]);
                        currentmat[mapname] = _SceneManager.getTexture(value.layers[i].src);
                        currentmat[mapname].needsUpdate = true;
                        currentmat.needsUpdate = true;
                        //currentmat[mapname] = THREE.ImageUtils.loadTexture(value.layers[i].src);

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
                }
            }
            for (var i in mapnames) {
                if (mapnames[i] == 'map') {
                    currentmat.map = _SceneManager.getTexture('white.png');
                    currentmat.map.wrapS = THREE.RepeatWrapping;
                    currentmat.map.wrapT = THREE.RepeatWrapping;
                    if (value.layers[0]) {
                        currentmat.map.repeat.x = value.layers[0].scalex;
                        currentmat.map.repeat.y = value.layers[0].scaley;
                        currentmat.map.offset.x = value.layers[0].offsetx;
                        currentmat.map.offset.y = value.layers[0].offsety;
                    }
                } else if(mapnames[i] != 'envMap') {
                    if (currentmat[mapnames[i]] != null) {
                        currentmat[mapnames[i]] = null;
                        currentmat.needsUpdate = true;
                    }
                }

            }
            if (currentmat.reflectivity && window.vwf_view) {
                var sky = vwf_view.kernel.kernel.callMethod(Engine.application(), 'getSkyMat')
                if (sky) {
                    currentmat.envMap = sky.uniforms.texture.value;
                    currentmat.envMap.mapping = new THREE.CubeReflectionMapping();
                }
            }

            return currentmat;
        }

        this.setMaterialDefSimple = function(currentmat, value) {
            if (!value) return;


            if (currentmat && !(currentmat instanceof THREE.MeshBasicMaterial)) {
                if (currentmat && currentmat.dispose)
                    currentmat.dispose();
                currentmat = null;
            }

            if (!currentmat) {
                currentmat = new THREE.MeshBasicMaterial();
                currentmat.needsUpdate = true;
            }


            currentmat.color.r = value.color.r;
            currentmat.color.g = value.color.g;
            currentmat.color.b = value.color.b;

            currentmat.morphTargets = value.morphTargets || false;
            currentmat.skinning = value.skinning || false;


            currentmat.side = value.side || 0;
            if (window.isIE() && currentmat.side == 2) currentmat.side = 0;
            currentmat.opacity = value.alpha;
            //if the alpha value less than 1, and the blendmode is defined but not noblending
            if (value.alpha < 1 || (value.blendMode !== undefined && value.blendMode !== THREE.NoBlending)) {
                if (currentmat.transparent == false) currentmat.needsUpdate = true;
                currentmat.transparent = true;
            } else {

                if (currentmat.transparent == true) currentmat.needsUpdate = true;
                currentmat.transparent = false;
            }

            if (value.blendMode !== undefined) {
                if (currentmat.blending != value.blendMode) currentmat.needsUpdate = true;
                currentmat.blending = value.blendMode;
            }
            if (value.fog !== undefined) {
                if (currentmat.fog != value.fog) currentmat.needsUpdate = true;
                currentmat.fog = value.fog;
            }

            currentmat.wireframe = value.wireframe || false;

            currentmat.combine = value.combine || 0;

            if (currentmat.wireframe != value.wireframe) currentmat.needsUpdate = true;

            if (currentmat.combine != value.combine) currentmat.needsUpdate = true;


            var mapnames = ['map'];
            currentmat.reflectivity = 0;


            for (var i = 0; i < value.layers.length; i++) {
                var mapname = null;
                if (value.layers[i].mapTo == 1) {
                    mapname = 'map';
                    currentmat.alphaTest = 1 - value.layers[i].alpha;

                }

                mapnames.splice(mapnames.indexOf(mapname), 1);

                String.prototype.endsWith = function(suffix) {
                    return this.indexOf(suffix, this.length - suffix.length) !== -1;
                };

                if ((currentmat[mapname] && currentmat[mapname]._SMsrc != value.layers[i].src) || !currentmat[mapname]) {
                    _SceneManager.releaseTexture(currentmat[mapname]);
                    currentmat[mapname] = _SceneManager.getTexture(value.layers[i].src);
                    currentmat[mapname].needsUpdate = true;
                    currentmat.needsUpdate = true;
                    //currentmat[mapname] = THREE.ImageUtils.loadTexture(value.layers[i].src);

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
            }
            for (var i in mapnames) {
                if (mapnames[i] == 'map') {
                    currentmat.map = _SceneManager.getTexture('white.png', true);
                    currentmat.map.wrapS = THREE.RepeatWrapping;
                    currentmat.map.wrapT = THREE.RepeatWrapping;
                    if (value.layers[0]) {
                        currentmat.map.repeat.x = value.layers[0].scalex;
                        currentmat.map.repeat.y = value.layers[0].scaley;
                        currentmat.map.offset.x = value.layers[0].offsetx;
                        currentmat.map.offset.y = value.layers[0].offsety;
                    }
                } else {
                    if (currentmat[mapnames[i]] != null) {
                        currentmat[mapnames[i]] = null;
                        currentmat.needsUpdate = true;
                    }
                }

            }
            if (currentmat.reflectivity && window.vwf_view) {
                var sky = vwf_view.kernel.kernel.callMethod(Engine.application(), 'getSkyMat')
                if (sky) {
                    currentmat.envMap = sky.uniforms.texture.value;
                    currentmat.envMap.mapping = new THREE.CubeReflectionMapping();
                }
            }

            return currentmat;
        }

        this.setMaterialDefBasic = function(currentmat, value) {
            if (!value) return;



            if (currentmat && !(currentmat instanceof THREE.MeshBasicMaterial)) {
                if (currentmat && currentmat.dispose)
                    currentmat.dispose();
                currentmat = null;
            }

            if (!currentmat) {
                currentmat = new THREE.MeshBasicMaterial();
                currentmat.needsUpdate = true;
            }


            currentmat.color.r = value.color.r;
            currentmat.color.g = value.color.g;
            currentmat.color.b = value.color.b;

            currentmat.morphTargets = value.morphTargets || false;
            currentmat.skinning = value.skinning || false;


            currentmat.side = value.side || 0;
            if (window.isIE() && currentmat.side == 2) currentmat.side = 0;
            currentmat.opacity = value.alpha;
            //if the alpha value less than 1, and the blendmode is defined but not noblending
            if (value.alpha < 1 || (value.blendMode !== undefined && value.blendMode !== THREE.NoBlending)) {
                if (currentmat.transparent == false) currentmat.needsUpdate = true;
                currentmat.transparent = true;
            } else {

                if (currentmat.transparent == true) currentmat.needsUpdate = true;
                currentmat.transparent = false;
            }

            if (value.blendMode !== undefined) {
                if (currentmat.blending != value.blendMode) currentmat.needsUpdate = true;
                currentmat.blending = value.blendMode;
            }
            if (value.fog !== undefined) {
                if (currentmat.fog != value.fog) currentmat.needsUpdate = true;
                currentmat.fog = value.fog;
            }

            currentmat.wireframe = value.wireframe || false;

            currentmat.combine = value.combine || 0;

            if (currentmat.wireframe != value.wireframe) currentmat.needsUpdate = true;

            if (currentmat.combine != value.combine) currentmat.needsUpdate = true;






            if(value.reflect > 1)
                value.reflect /= Math.pow(10, Math.ceil(Math.log10(value.reflect)));
            else if(value.reflect < 0)
                value.reflect = 0;



            var mapnames = ['map'];
            currentmat.reflectivity = value.reflect;


            for (var i = 0; i < value.layers.length; i++) {
                var mapname;
                if (value.layers[i].mapTo == 1) {
                    mapname = 'map';
                    currentmat.alphaTest = 1 - value.layers[i].alpha;

                }

                mapnames.splice(mapnames.indexOf(mapname), 1);

                String.prototype.endsWith = function(suffix) {
                    return this.indexOf(suffix, this.length - suffix.length) !== -1;
                };

                if ((currentmat[mapname] && currentmat[mapname]._SMsrc != value.layers[i].src) || !currentmat[mapname]) {
                    _SceneManager.releaseTexture(currentmat[mapname]);
                    currentmat[mapname] = _SceneManager.getTexture(value.layers[i].src);
                    currentmat[mapname].needsUpdate = true;
                    currentmat.needsUpdate = true;
                    //currentmat[mapname] = THREE.ImageUtils.loadTexture(value.layers[i].src);

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
            }
            for (var i in mapnames) {
                if (mapnames[i] == 'map') {
                    currentmat.map = _SceneManager.getTexture('white.png', true);
                    currentmat.map.wrapS = THREE.RepeatWrapping;
                    currentmat.map.wrapT = THREE.RepeatWrapping;
                    if (value.layers[0]) {
                        currentmat.map.repeat.x = value.layers[0].scalex;
                        currentmat.map.repeat.y = value.layers[0].scaley;
                        currentmat.map.offset.x = value.layers[0].offsetx;
                        currentmat.map.offset.y = value.layers[0].offsety;
                    }
                } else {
                    if (currentmat[mapnames[i]] != null) {
                        currentmat[mapnames[i]] = null;
                        currentmat.needsUpdate = true;
                    }
                }

            }
            if (currentmat.reflectivity && window.Engine) {
                var sky = Engine.callMethod(Engine.application(), 'getSkyMat')
                if (sky) {
                    currentmat.envMap = sky.uniforms.texture.value;
                    currentmat.envMap.mapping = new THREE.CubeReflectionMapping();
                }
            }

            return currentmat;
        }
        // blend all diffuse textures based on alpha ratios
        this.setMaterialDefMix = function(currentmat, value) {
            if (!value) return;


            if (currentmat && !(currentmat instanceof THREE.ShaderMaterial)) {
                if (currentmat && currentmat.dispose)
                    currentmat.dispose();
                currentmat = null;
            }

            if (!currentmat) {
                var config = {
                    'uniforms': THREE.UniformsUtils.merge([THREE.ShaderLib.phong.uniforms, {
                        'diffuse_tex': {
                            type: 'tv',
                            value: []
                        },
                        'dtex_count': {
                            type: 'i',
                            value: 0
                        },
                        'alpha': {
                            type: 'fv1',
                            value: []
                        },
                        'tex_xfrm': {
                            type: 'fv',
                            value: []
                        }

                    }]),
                    'defines': {
                        'MAX_DIFFUSE': 8
                    },
                    'vertexShader': THREE.ShaderLib.phong.vertexShader,
                    'fragmentShader': 'void main(){}'
                };

                var mix_pars_fragment = [
                    "#if defined( USE_MAP ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( USE_SPECULARMAP )",
                    "varying vec2 vUv;",
                    "#endif",
                    "#ifdef USE_MAP",
                    "uniform sampler2D diffuse_tex[MAX_DIFFUSE];",
                    "uniform float alpha[MAX_DIFFUSE];",
                    "uniform vec3 tex_xfrm[3*MAX_DIFFUSE];",
                    "uniform int dtex_count;",
                    "#endif",
                ].join('\n');

                var mix_fragment = [
                    "#ifdef USE_MAP",

                    "   float alphaTotal = 0.0;",
                    "   vec4 texColors[MAX_DIFFUSE];",
                    "   vec4 texelColor = vec4(0.0,0.0,0.0,1.0);",
                    "   if( opacity < 1.0 ) texelColor.w = 0.0;",

                    // transform UV to account for offset/scale
                    // also total up alpha contributions
                    "   for( int i=0; i<MAX_DIFFUSE; ++i ){",
                    "       if( i < dtex_count ) {",
                    "           mat3 transform = mat3(tex_xfrm[3*i],tex_xfrm[3*i+1],tex_xfrm[3*i+2]);",
                    "           vec3 temp = transform * vec3(vUv,1.0);",
                    "           vec2 tc = vec2(temp.x,temp.y);",
                    "           texColors[i] = texture2D(diffuse_tex[i], tc);",

                    "           alphaTotal += alpha[i] * texColors[i].a;",
                    "       }",
                    "   }",

                    // calculate contributions of each layer towards final color
                    "   for( int i=0; i<MAX_DIFFUSE; ++i ){",
                    "       if( i < dtex_count ) {",
                    "           float aMix = (alpha[i]*texColors[i].a)/alphaTotal;",
                    //"         texelColor += aMix * texColors[i];",
                    "           texelColor.rgb += aMix * texColors[i].rgb;",
                    "           texelColor.a = max(texelColor.a, texColors[i].a);",
                    "       }",
                    "   }",

                    // brighten up under-saturated colors
                    "   if( alphaTotal < 1.0 )",
                    "       texelColor.rgb = 1.0/alphaTotal * texelColor.rgb;",
                    "",
                    "   #ifdef GAMMA_INPUT",
                    "       texelColor.xyz *= texelColor.xyz;",
                    "   #endif",

                    "   gl_FragColor = gl_FragColor * texelColor;",
                    "#endif"
                ].join('\n');


                config.fragmentShader = [
                    "uniform vec3 diffuse;",
                    "uniform float opacity;",
                    "uniform vec3 ambient;",
                    "uniform vec3 emissive;",
                    "uniform vec3 specular;",
                    "uniform float shininess;",
                    "varying vec3 vFogPosition;",
                    THREE.ShaderChunk["color_pars_fragment"],

                    //THREE.ShaderChunk[ "map_pars_fragment" ],
                    mix_pars_fragment,

                    THREE.ShaderChunk["lightmap_pars_fragment"],
                    THREE.ShaderChunk["envmap_pars_fragment"],
                    THREE.ShaderChunk["lights_phong_pars_fragment"],
                    THREE.ShaderChunk["fog_pars_fragment"],
                    THREE.ShaderChunk["shadowmap_pars_fragment"],
                    THREE.ShaderChunk["bumpmap_pars_fragment"],
                    THREE.ShaderChunk["normalmap_pars_fragment"],
                    THREE.ShaderChunk["specularmap_pars_fragment"],
                    THREE.ShaderChunk["sphericalHarmonicAmbient_pars_fragment"],
                    THREE.ShaderChunk["alphamap_pars_fragment"],

                    "void main() {",
                    "gl_FragColor = vec4( vec3 ( 1.0 ), opacity );",
                    THREE.ShaderChunk["sphericalHarmonicAmbient_fragment"],

                    //THREE.ShaderChunk[ "map_fragment" ],
                    mix_fragment,

                    THREE.ShaderChunk["alphatest_fragment"],
                    THREE.ShaderChunk["specularmap_fragment"],
                    THREE.ShaderChunk["lights_phong_fragment"],
                    THREE.ShaderChunk["lightmap_fragment"],
                    THREE.ShaderChunk["color_fragment"],
                    THREE.ShaderChunk["envmap_fragment"],
                    THREE.ShaderChunk["shadowmap_fragment"],
                    THREE.ShaderChunk["linear_to_gamma_fragment"],
                    THREE.ShaderChunk["fog_fragment"],
                    THREE.ShaderChunk["alphamap_fragment"],
                    "}"
                ].join("\n");

                currentmat = new THREE.ShaderMaterial(config);
                currentmat.needsUpdate = true;
                currentmat.lights = true;
                currentmat.fog = value.fog !== undefined ? value.fog : true;
            }

            var diffuse_tex = [];
            var alphas = [];
            var transform = [];

            for (var i in value.layers) {
                var layer = value.layers[i];
                if (layer.mapTo == 1) {
                    currentmat.map = true;

                    // have to total up, can't just assign. see below
                    diffuse_tex.push(_SceneManager.getTexture(layer.src));
                    alphas.push(layer.alpha);
                    var tfm = new THREE.Matrix3(layer.scalex, 0, layer.offsetx, 0, layer.scaley, layer.offsety, 0, 0, 1);
                    transform.push.apply(transform, tfm.elements);

                } else if (window._dRenderer && layer.mapTo == 2 && _dRenderer.supportsStandardDerivatives()) {
                    currentmat.bumpMap = true;
                    currentmat.uniforms.bumpMap.value = _SceneManager.getTexture(layer.src);
                    currentmat.uniforms.bumpScale.value = value.layers[i].alpha;
                } else if (layer.mapTo == 3) {
                    currentmat.lightMap = true;
                    currentmat.uniforms.lightMap.value = _SceneManager.getTexture(layer.src);
                } else if (window._dRenderer && layer.mapTo == 4 && _dRenderer.supportsStandardDerivatives()) {
                    currentmat.normalMap = true;
                    currentmat.uniforms.normalMap.value = _SceneManager.getTexture(layer.src);
                    currentmat.uniforms.normalScale.value = new THREE.Vector2(value.layers[i].alpha, value.layers[i].alpha);
                } else if (layer.mapTo == 5) {
                    currentmat.specularMap = true;
                    currentmat.uniforms.specularMap.value = _SceneManager.getTexture(layer.src);
                } else if (layer.mapTo == 6) {
                    currentmat.envMap = true;
                    currentmat.uniforms.envMap.value = _SceneManager.getTexture(layer.src);
                }

            }


            // define uniforms used in diffuse mixing
            currentmat.uniforms.diffuse_tex = {
                type: 'tv',
                value: diffuse_tex
            };
            currentmat.uniforms.dtex_count = {
                type: 'i',
                value: diffuse_tex.length
            };
            currentmat.uniforms.alpha = {
                type: 'fv1',
                value: alphas
            };
            currentmat.uniforms.tex_xfrm = {
                type: 'fv',
                value: transform
            };

            if(value.specularLevel > 1)
                value.specularLevel /= Math.pow(10, Math.ceil(Math.log10(value.specularLevel)));
            else if(value.specularLevel < 0)
                value.specularLevel = 0;

            if(value.reflect > 1)
                value.reflect /= Math.pow(10, Math.ceil(Math.log10(value.reflect)));
            else if(value.reflect < 0)
                value.reflect = 0;


            // assign other random uniforms/flags
            currentmat.uniforms.diffuse.value = value.color; //{r: value.color.r, g: value.color.g, b: value.color.b};
            currentmat.uniforms.emissive.value = value.emit;
            currentmat.uniforms.ambient.value = value.ambient;
            var temp = new THREE.Vector3(value.specularColor.r, value.specularColor.g, value.specularColor.b);
            temp.multiplyScalar(value.specularLevel);
            currentmat.uniforms.specular.value = {
                r: temp.x,
                b: temp.y,
                g: temp.z
            };
            currentmat.uniforms.shininess.value = value.shininess * 5;
            currentmat.uniforms.opacity.value = value.alpha;
            currentmat.uniforms.reflectivity.value = value.reflect;
            currentmat.uniforms.combine.value = value.combine || 0;

            currentmat.side = value.side || 0;
            if (window.isIE() && currentmat.side == 2) currentmat.side = 0;

            // flag for update if changing
            if (currentmat.transparent = value.alpha < 1 || (value.blendMode !== undefined && value.blendMode !== THREE.NoBlending)) {
                if (!currentmat.transparent) currentmat.needsUpdate = true;
                currentmat.transparent = true;
            }
            if (currentmat.blending !== value.blendMode) {
                currentmat.blending = value.blendMode || THREE.NoBlending;
                currentmat.needsUpdate = true;
            }
            if (value.fog !== undefined) {
                if (currentmat.fog != value.fog) currentmat.needsUpdate = true;
                currentmat.fog = value.fog;
            }

            // configure reflectivity
            /*if(currentmat.uniforms.reflectivity.value)
             {
             var sky = vwf_view.kernel.kernel.callMethod(Engine.application(),'getSkyMat');
             if(sky)
             {
             //console.log('Skymap:', sky.uniforms.texture);
             currentmat.envMap = true;
             currentmat.uniforms.envMap.value = sky.uniforms.texture.value;
             currentmat.uniforms.envMap.value.mapping = new THREE.CubeReflectionMapping();
             }
             }*/

            return currentmat;
        }
        this.getDefForMaterial = function(currentmat) {
            try {


                if(currentmat instanceof THREE.MeshFaceMaterial)
                {
                    var def = [];
                    for(var i in currentmat.materials)
                    {
                        def[i] = this.getDefForMaterial(currentmat.materials[i]);
                    }
                    return def;
                }


                var value = {};
                value.color = {}
                value.color.r = parseFloat(currentmat.color.r.toFixed(3));
                value.color.g = parseFloat(currentmat.color.g.toFixed(3));
                value.color.b = parseFloat(currentmat.color.b.toFixed(3));
                value.ambient = {r:0,g:0,b:0};

                if(currentmat.ambient)
                {
                    value.ambient.r =parseFloat( currentmat.ambient.r.toFixed(3));
                    value.ambient.g = parseFloat(currentmat.ambient.g.toFixed(3));
                    value.ambient.b = parseFloat(currentmat.ambient.b.toFixed(3));
                }
                value.emit = {r:0,g:0,b:0};
                if(currentmat instanceof THREE.MeshBasicMaterial)
                    value.emit = {r:1,g:1,b:1};
                if(currentmat.emissive)
                {
                    value.emit.r = parseFloat(currentmat.emissive.r.toFixed(3));
                    value.emit.g = parseFloat(currentmat.emissive.g.toFixed(3));
                    value.emit.b = parseFloat(currentmat.emissive.b.toFixed(3));
                }

                value.specularColor = {r:0,g:0,b:0};
                if(currentmat.specular)
                {
                    value.specularColor.r = parseFloat(currentmat.specular.r.toFixed(3));
                    value.specularColor.g = parseFloat(currentmat.specular.g.toFixed(3));
                    value.specularColor.b = parseFloat(currentmat.specular.b.toFixed(3))
                }
                value.specularLevel = 1;
                value.alpha = currentmat.opacity;
                value.shininess = (currentmat.shininess || 0) / 50;
                value.side = currentmat.side || 0;
                value.reflect = currentmat.reflectivity * 10 / 100;
                var mapnames = ['map', 'bumpMap', 'lightMap', 'normalMap', 'specularMap'];
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
                        if (i == 0) value.layers[value.layers.length - 1].alpha = -currentmat.alphaTest + 1;
                        if (i == 3) value.layers[value.layers.length - 1].alpha = currentmat.normalScale.x;
                        if (i == 1) value.layers[value.layers.length - 1].alpha = currentmat.bumpScale;
                        value.layers[value.layers.length - 1].src = map._SMsrc || map.image.src;
                        if (map.mapping instanceof THREE.UVMapping) value.layers[value.layers.length - 1].mapInput = 0;
                        if (map.mapping instanceof THREE.CubeReflectionMapping) value.layers[value.layers.length - 1].mapInput = 1;
                        if (map.mapping instanceof THREE.CubeRefractionMapping) value.layers[value.layers.length - 1].mapInput = 2;
                        if (map.mapping instanceof THREE.SphericalReflectionMapping) value.layers[value.layers.length - 1].mapInput = 3;
                        if (map.mapping instanceof THREE.SphericalRefractionMapping) value.layers[value.layers.length - 1].mapInput = 4;

                    }
                }
                return value;
            } catch (e) {
                return this.defaultmaterialDef;
            }
        }
         this.defaultmaterialDef = {
            shininess: 0.001,
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
            side: 0,
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

    }
    var _MaterialCache = new MaterialCache();
    window._MaterialCache = _MaterialCache;

define([],_MaterialCache);    
