function NoiseTerrainAlgorithm() 
{	
	
		
	this.init = function(data)
	{
		
		console.log(data);
		this.importScript('simplexNoise.js');
		this.importScript('Rc4Random.js');
	}
	//This can generate data on the main thread, and it will be passed to the coppies in the thread pool
	this.poolInit = function()
	{
		return 65;
	}
	//This is the settings data, set both main and pool side
	this.setAlgorithmData = function(seed)
	{
		this.SimplexNoise = new SimplexNoise((new Rc4Random(seed +"")).random);
	}
	this.setAlgorithmDataPool = function(seed)
	{
		this.SimplexNoise = new SimplexNoise((new Rc4Random(seed +"")).random);
	}
	this.getAlgorithmDataPool = function(seed)
	{
		return this.seed;
	}
	this.forceTileRebuildCallback = function()
	{
		return true;
	}
	this.getEditorData = function()
	{
	
	}
	this.getMaterialUniforms = function(mesh,matrix)
	{
		var uniforms_default = {
		grassSampler:   { type: "t", value: _SceneManager.getTexture( "terrain/grass.jpg",true ) },
		cliffSampler:   { type: "t", value: _SceneManager.getTexture( "terrain/cliff.jpg",true ) },
		dirtSampler:   { type: "t", value: _SceneManager.getTexture( "terrain/dirt.jpg",true ) },
		snowSampler:   { type: "t", value: _SceneManager.getTexture( "terrain/snow.jpg",true ) }
		};
		
		uniforms_default.grassSampler.value.wrapS = uniforms_default.grassSampler.value.wrapT = THREE.RepeatWrapping;
		uniforms_default.cliffSampler.value.wrapS = uniforms_default.cliffSampler.value.wrapT = THREE.RepeatWrapping;
		uniforms_default.dirtSampler.value.wrapS = uniforms_default.dirtSampler.value.wrapT = THREE.RepeatWrapping;
		uniforms_default.snowSampler.value.wrapS = uniforms_default.snowSampler.value.wrapT = THREE.RepeatWrapping;
		return uniforms_default;
	}
	this.getDiffuseFragmentShader = function(mesh,matrix)
	{
		return (
		"uniform sampler2D grassSampler;\n"+
		"uniform sampler2D cliffSampler;\n"+
		"uniform sampler2D dirtSampler;\n"+
		"uniform sampler2D snowSampler;\n"+
		"uniform sampler2D noiseSampler;\n"+
		"vec4 getGrassDensity(vec3 o, vec3 n, vec2 p) {return vec4(1.0,1.0,1.0,1.0);}" +
		"vec4 getMix(vec3 norm)" +
		"{"+
		"float side = min(1.0,pow(1.0-abs(dot(norm,(vec4(0.0,0.0,1.0,0.0)).xyz)),2.0) * 10.0);\n"+
			"float bottom = 1.0-smoothstep(-20.0,60.0,npos.z);\n"+
			"float top = clamp(0.0,1.0,(smoothstep(100.0,140.0,npos.z)));\n"+
			"float middle = clamp(0.0,1.0,(1.0 - bottom - top));\n"+
			"bottom = clamp(0.0,1.0,mix(bottom,0.0,npos.z/100.0));\n"+
			"vec4 mixvec =  normalize(vec4(bottom,middle,side* 4.0,top)) ;\n"+
			"return mixvec;\n"+
		"}"+
		"vec4 getTexture(vec3 coords, vec3 norm, vec2 uv)" +
		"{"+
			//"coords /= 100.0;\n"+
			"vec4 noiseMain = texture2D(noiseSampler,(npos.xy/10.0)/2.0);\n"+

			"vec4 mixvec =  getMix(norm + (noiseMain.rgb - .5)/10.0) ;\n"+
			
			"vec2 c0 = (coords.xy/10.0)/2.0 ;\n"+
			"vec2 c1 = (coords.xy/10.0)/2.0 ;\n"+
			"c1.y /= .5;\n"+
			"vec2 c2 = (coords.xy/10.0)/2.0 ;\n"+
			"vec2 c3 = (coords.xy/30.0)/2.0 ;\n"+
			"vec2 c0a = (coords.xy/20.0)/2.0 ;\n"+
			"vec2 c1a = (coords.xy/100.0)/2.0 ;\n"+
			"vec2 c2a = (coords.xy/100.0)/2.0 ;\n"+
			"vec2 c3a = (coords.xy/300.0)/2.0 ;\n"+
			"vec4 grass =.5*texture2D(grassSampler,c0) +  .5*texture2D(grassSampler,c0a);\n"+
			"vec4 cliff =.5*texture2D(cliffSampler,c1) +  .5*texture2D(cliffSampler,c1a);\n"+
			"vec4 dirt = .5*texture2D(dirtSampler,c2) +  .5*texture2D(dirtSampler,c2a);\n"+
			"vec4 snow = .5*texture2D(snowSampler,c3) +  .5*texture2D(snowSampler,c3a);\n"+
			"vec4 noise = texture2D(noiseSampler,c0);\n"+
			
			"vec4 grass1 = mix(grass,cliff/4.0,noise.r*noise.r*noise.r);"+
			"snow = mix(snow,dirt/4.0,noise.g*noise.r*noise.b);"+
			
			"return mixvec.r * grass1 + mixvec.g * grass1 + (mixvec.b) * cliff/2.0 + mixvec.a * snow;\n"+
		"}")
	}
	this.displace= function(vert)
	{
		var z = 0;
		z = this.SimplexNoise.noise2D((vert.x)/10000,(vert.y)/1000) * 15;
		z = z*z;
		z += this.SimplexNoise.noise2D((vert.x)/100000,(vert.y)/100000) * 50;
		z += this.SimplexNoise.noise2D((vert.x)/1000,(vert.y)/1000) * 25;
		z += this.SimplexNoise.noise2D((vert.x)/5000,(vert.y)/5000) * 50;
		z += this.SimplexNoise.noise2D((vert.x)/500,(vert.y)/500) * 10;
		 z += this.SimplexNoise.noise2D((vert.x)/100,(vert.y)/100) * 15.0;
//		 z += this.SimplexNoise.noise2D((vert.x)/20,(vert.y)/20) * 11.5;
	//	 z += this.SimplexNoise.noise2D((vert.x)/5,(vert.y)/5) * 1.25;
		
		z -= Math.sqrt(vert.x * vert.x + vert.y * vert.y)/ 20;
		z = z/5 - 1.5;
		if(z < 1)
			z = 1;
		return z;
	}
}
//@ sourceURL=threejs.terrain.NoiseTerrainAlgorithm