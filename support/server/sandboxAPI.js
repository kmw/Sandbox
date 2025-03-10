var libpath = require('path'),
	http = require("http"),
	fs = require('fs-extra'),
	url = require("url"),
	mime = require('mime'),
	sio = require('socket.io'),
	YAML = require('js-yaml'),
	
	async = require('async'),
	imgSize = require('image-size');

require('./hash.js');
var _3DR_proxy = require('./3dr_proxy.js');
var safePathRE = RegExp('/\//' + (libpath.sep == '/' ? '\/' : '\\') + '/g');
var datapath = '.' + libpath.sep + 'data';
var DAL = require('./DAL')
	.DAL;
var analyticsObj;
var assetPreload = require('./AssetPreload.js');
var passwordUtils = require('./passwordUtils');
var CheckPassword = passwordUtils.CheckPassword;
var SiteLogin = passwordUtils.SiteLogin;
var SiteLogout = passwordUtils.SiteLogout;
var UpdatePassword = passwordUtils.UpdatePassword;
var sessions = require('./sessions');
var mailTools = require('./mailTools');
var xapi = require('./xapi');
var logger = require('./logger');

// default path to data. over written by setup flags
//generate a random id.
var GUID = require('node-uuid')
	.v4;


//simple functio to write a response
function respond(response, status, message)
	{
		response.writeHead(status,
		{
			"Content-Type": "text/plain",
			"Cache-Control": "private, max-age=0, no-cache"
		});
		response.write(message + "\n");
		logger.debug(message, 2);
		response.end();
	}
	//Just serve a simple file
function ServeFile(filename, response, URL, JSONHeader)
	{
		logger.debug(filename, 2);
		var datatype = "binary";
		if (JSONHeader)
			datatype = "utf8";
		fs.readFile(filename, datatype, function(err, file)
		{
			if (err)
			{
				respond(response, 500, err);
				return;
			}
			var type = mime.lookup(filename) || "text/json";
			response.writeHead(200,
			{
				"Content-Type": !JSONHeader ? type : "text/json",
				"Cache-Control": "private, max-age=0, no-cache"
			});
			if (datatype == "binary")
				response.write(file, "binary");
			else
			{
				var o = {};
				o[JSONHeader] = file;
				response.write(JSON.stringify(o), "utf8");
			}
			response.end();
		});
	}
	//get a profile for a user
	//url must contain UID for user and pass hash
function ServeProfile(UID, response, URL)
{
	DAL.getUser(UID, function(user)
	{
		if (!user)
		{
			respond(response, 401, "user not logged in, or profile not found");
		}
		else
		{
			user = JSON.parse(JSON.stringify(user));
			delete user.Password;
			respond(response, 200, JSON.stringify(user));
		}
	});
}

function GetLoginData(response, URL)
	{
		if (URL.loginData)
		{
			var logindata = {
				user_uid: URL.loginData.UID,
				username: URL.loginData.Username,
				admin: URL.loginData.UID == global.adminUID
			};
			logindata.instances = [];
			logindata.clients = [];
			for (var i in global.instances.instances)
			{
				for (var j in global.instances.instances[i].clients)
				{
					if (global.instances.instances[i].clients[j].loginData && global.instances.instances[i].clients[j].loginData.UID == URL.loginData.UID)
					{
						logindata.instances.push(i);
						logindata.clients.push(j);
					}
				}
			}
			respond(response, 200, JSON.stringify(logindata));
		}
		else
			respond(response, 401, JSON.stringify(
			{
				username: null
			}));
		return;
	}
	//Take ownership if a client websocket connection
	//must provide a pass and name for the user, and the instance and client ids.
	//This will associate a user with a reflector connection
	//The reflector will not accept incomming messages from an anonymous connection
function InstanceLogin(response, URL)
{
	respond(response, 200, "No longer supported. Login now travels over the socket handshake");
}

function InstanceLogout(response, URL)
{
	if (!URL.loginData)
	{
		respond(response,401,"Client Not Logged In");
		return;
		
	}
	var instance = URL.query.S;
	var cid = URL.query.CID;
	if (URL.loginData.clients[cid])
	{
		if (global.instances.get(URL.loginData.clients[cid]))
		{
			if (global.instances.get(URL.loginData.clients[cid])
				.clients[cid])
			{
				delete global.instances.get(URL.loginData.clients[cid])
					.clients[cid].loginData;
			}
		}
		delete URL.loginData.clients[cid];
		respond(response, 200, "Client Logged out " + instance);
		xapi.sendStatement(URL.loginData.UID, xapi.verbs.logged_out, instance);
	}
	else
	{
		respond(response, 200, "Client was not Logged into " + instance);
		return;
	}
	return;
}

function getInventory(URL, response)
{
	if (!URL.loginData)
	{
		respond(response, 401, 'no login data');
		return;
	}
	DAL.getInventoryDisplayData(URL.loginData.UID, function(inventory)
	{
		ServeJSON(inventory, response, URL);
	});
}

function getInventoryItemAssetData(URL, response)
{
	if (!URL.loginData)
	{
		respond(response, 401, 'no login data');
		return;
	}
	if (!URL.query.AID)
	{
		respond(response, 500, 'no AID in query string');
		return;
	}
	DAL.getInventoryItemAssetData(URL.loginData.UID, URL.query.AID, function(item)
	{
		ServeJSON(item, response, URL);
	});
}

function getInventoryItemMetaData(URL, response)
{
	if (!URL.loginData)
	{
		respond(response, 401, 'no login data');
		return;
	}
	if (!URL.query.AID)
	{
		respond(response, 500, 'no AID in query string');
		return;
	}
	DAL.getInventoryItemMetaData(URL.loginData.UID, URL.query.AID, function(item)
	{
		ServeJSON(item, response, URL);
	});
}

function addInventoryItem(URL, data, response)
{
	if (!URL.loginData)
	{
		respond(response, 401, 'no login data');
		return;
	}
	DAL.addToInventory(URL.loginData.UID,
	{
		title: URL.query.title,
		uploaded: new Date(),
		description: '',
		type: URL.query.type
	}, data, function(id)
	{
		respond(response, 200, id);
	});
}

function updateInventoryItemMetadata(URL, data, response)
{
	if (!URL.loginData)
	{
		respond(response, 401, 'no login data');
		return;
	}
	if (!URL.query.AID)
	{
		respond(response, 500, 'no AID in query string');
		return;
	}
	var parsedData;
	try
	{
		parsedData = JSON.parse(data);
	}
	catch (e)
	{
		logger.error(e);
		respond(response, 500, 'parse error');
		return;
	}
	DAL.updateInventoryItemMetadata(URL.loginData.UID, URL.query.AID, parsedData, function()
	{
		respond(response, 200, 'ok');
	});
}

function deleteInventoryItem(URL, response)
{
	if (!URL.loginData)
	{
		respond(response, 401, 'no login data');
		return;
	}
	if (!URL.query.AID)
	{
		respond(response, 500, 'no AID in query string');
		return;
	}
	DAL.deleteInventoryItem(URL.loginData.UID, URL.query.AID, function()
	{
		respond(response, 200, 'ok');
	});
}

function getGlobalInventory(URL, response)
{
	DAL.getInventoryDisplayData('___Global___', function(inventory)
	{
		ServeJSON(inventory, response, URL);
	});
}

function getGlobalInventoryItemAssetData(URL, response)
{
	if (!URL.query.AID)
	{
		respond(response, 500, 'no AID in query string');
		return;
	}
	DAL.getInventoryItemAssetData('___Global___', URL.query.AID, function(item)
	{
		ServeJSON(item, response, URL);
	});
}

function getGlobalInventoryItemMetaData(URL, response)
{
	if (!URL.query.AID)
	{
		respond(response, 500, 'no AID in query string');
		return;
	}
	DAL.getInventoryItemMetaData('___Global___', URL.query.AID, function(item)
	{
		ServeJSON(item, response, URL);
	});
}

function addGlobalInventoryItem(URL, data, response)
{
	if (!URL.loginData)
	{
		respond(response, 401, 'no login data');
		return;
	}
	DAL.addToInventory('___Global___',
	{
		uploader: URL.loginData.UID,
		title: URL.query.title,
		uploaded: new Date(),
		description: '',
		type: URL.query.type
	}, data, function(id)
	{
		respond(response, 200, id);
		xapi.sendStatement(URL.loginData.UID, xapi.verbs.published_item, id, URL.query.title);
	});
}

function deleteGlobalInventoryItem(URL, response)
{
	if (!URL.loginData)
	{
		respond(response, 401, 'no login data');
		return;
	}
	if (!URL.query.AID)
	{
		respond(response, 500, 'no AID in query string');
		return;
	}
	DAL.getInventoryItemMetaData('___Global___', URL.query.AID, function(item)
	{	
		if(!item)
		{
			respond(response, 500, 'asset not found');		
			return;
		}
		if (item.uploader == URL.loginData.UID)
		{
			DAL.deleteInventoryItem('___Global___', URL.query.AID, function()
			{
				respond(response, 200, 'ok');
			});
		}
		else
		{
			respond(response, 401, 'you are not the asset owner');
		}
	});
}

function ServeJSON(jsonobject, response, URL)
{
	response.writeHead(200,
	{
		"Content-Type": "text/json",
		"Cache-Control": "private, max-age=0, no-cache"
	});
	if (jsonobject)
	{
		if (jsonobject.constructor != String)
			response.write(JSON.stringify(jsonobject), "utf8");
		else
			response.write(jsonobject, "utf8");
	}
	response.end();
}

function SaveProfile(URL, data, response)
{
	if (!URL.loginData)
	{
		respond(response, 401, 'no login data saving profile ' + filename);
		return;
	}
	try
	{
		data = JSON.parse(data);
	}
	catch (e)
	{
		logger.error(e);
		respond(response, 500, 'parse error');
		return;
	}
	//do not allow update of pass in this way.
	delete data.Password;
	delete data.password;
	delete data.Username;
	delete data.username;
	delete data.Salt;
	delete data.salt;
	delete data.inventoryKey;
	DAL.updateUser(URL.loginData.UID, data, function()
	{
		respond(response, 200, '');
		return;
	});
}

function validateEmail(email)
{
	var re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
	return re.test(email);
}

function validateUsername(password)
{
	if (password.length < 3)
		return 'Username should be more than three characters'
	if (password.length > 20)
		return 'Username should be less than 20 characters'
	var hasNonalphas = /\W/.test(password);
	if (hasNonalphas)
		return 'Username should contain only letters and numbers'
	return true;
}

function CreateProfile(URL, data, response)
	{
		try
		{
			data = JSON.parse(data);
		}
		catch (e)
		{
			respond(response, 500, 'parse error');
			return;
		}
		//dont check the pass - it's a big hash, so complexity rules are meaningless
		data.Password = Hash(URL.query.P || data.Password);
		if (validateUsername(data.Username) !== true)
		{
			respond(response, 500, 'Bad Username');
			return;
		}
		if (validateEmail(data.Email) !== true)
		{
			respond(response, 500, 'Bad Email');
			return;
		}
		//someone could try to hit the api and create a user with a blank pass. Don't allow
		if (!data.Password || data.Password.length < 8)
		{
			respond(response, 401, 'bad password');
			return;
		}
		DAL.createUser(URL.query.UID, data, function(ok, err)
		{
			if (ok)
			{
				respond(response, 200, '');
				mailTools.newUser(URL.query.UID, data.Email);
				xapi.sendStatement(URL.query.UID, xapi.verbs.registered);
			}
			else
				respond(response, 500, err);
			return;
		});
	}
	//Check that the UID is the author of the asset
function CheckAuthor(UID, assetFilename, callback)
	{
		var basedir = datapath + "/GlobalAssets/".replace(safePathRE);
		if (!fs.existsSync(assetFilename))
		{
			callback(false);
			return;
		}
		else
		{
			fs.readFile(assetFilename, "utf8", function(err, file)
			{
				var asset;
				try
				{
					asset = JSON.parse(file);
				}
				catch (e)
				{
					logger.error(e);
					callback(false);
					return;
				}
				var storedAuthor = asset.Author;
				var suppliedAuthor = UID;
				logger.debug(storedAuthor, suppliedAuthor, 2);
				callback(storedAuthor == suppliedAuthor);
			});
			return;
		}
		return;
	}
	//Check that the UID is the owner of the state
function CheckOwner(UID, stateFilename, callback)
	{
		var basedir = datapath + "/GlobalAssets/".replace(safePathRE);
		if (!fs.existsSync(stateFilename))
		{
			callback(false);
			return;
		}
		else
		{
			fs.readFile(stateFilename, "utf8", function(err, file)
			{
				var asset;
				try
				{
					asset = JSON.parse(file);
				}
				catch (e)
				{
					logger.error(e);
					callback(false);
					return;
				}
				var storedOwner = asset[asset.length - 1].owner;
				var suppliedOwner = UID;
				logger.debug(storedOwner, suppliedOwner, 2);
				callback(storedOwner == suppliedOwner);
			});
			return;
		}
		return;
		callback(false);
	}
	//Save an asset. the POST URL must contain valid name/pass and that UID must match the Asset Author
function SaveAsset(URL, filename, data, response)
	{
		var UID = URL.query.UID || (URL.loginData && URL.loginData.UID);
		var P = URL.query.P || (URL.loginData && URL.loginData.Password);
		CheckPassword(UID, P, function(e)
		{
			//Did no supply a good name pass pair
			if (!e)
			{
				respond(response, 401, 'Incorrect password when saving Asset ' + filename);
				return;
			}
			else
			{
				//the asset is new
				if (!fs.existsSync(filename))
				{
					//Save the asset Author info
					logger.info('parse asset', 2);
					var asset;
					try
					{
						asset = JSON.parse(data);
					}
					catch (e)
					{
						logger.error(e);
						respond(response, 500, 'parse error');
						return;
					}
					asset.Author = URL.query.UID;
					data = JSON.stringify(asset);
					SaveFile(filename, data, response);
					logger.warn('Saved Asset ' + filename, 2);
					return;
				}
				else
				{
					//overwriting the asset;
					CheckAuthor(UID, filename, function(e)
					{
						//trying to overwrite existing file that user is not author of
						if (!e)
						{
							respond(response, 401, 'Permission denied to overwrite asset ' + filename);
							return;
						}
						else
						{
							//Over writing an asset that the user owns
							var asset;
							try
							{
								asset = JSON.parse(data);
							}
							catch (e)
							{
								logger.error(e);
								respond(response, 500, 'parse error');
								return;
							}
							asset.Author = URL.query.UID;
							data = JSON.stringify(asset);
							SaveFile(filename, data, response);
							logger.warn('Saved Asset ' + filename, 2);
							return;
						}
					});
				}
			}
		});
	}
	//Save an asset. the POST URL must contain valid name/pass and that UID must match the Asset Author
function DeleteProfile(URL, filename, response)
{
	DAL.deleteUser(URL.loginData, function()
	{
		respond(response, 200, '');
	});
}
var deleteFolderRecursive = function(path)
{
	if (fs.existsSync(path))
	{
		fs.readdirSync(path)
			.forEach(function(file, index)
			{
				var curPath = path + libpath.sep + file;
				if (fs.statSync(curPath)
					.isDirectory())
				{ // recurse
					deleteFolderRecursive(curPath);
				}
				else
				{ // delete file
					fs.unlinkSync(curPath);
				}
			});
		fs.rmdirSync(path);
	}
};

function strBeginsWith(str, prefix)
{
	return str.match('^' + prefix) == prefix;
}

function strEndsWith(str, suffix)
	{
		return str.match(suffix + "$") == suffix;
	}
	//Copy the world to a new world
function CopyInstance(URL, SID, response)
	{
		if (!URL.loginData)
		{
			respond(response, 401, 'Anonymous users cannot copy instances');
			return;
		}
		SID = SID ? SID : URL.query.SID;
		if (SID.length == 16)
		{
			SID = "/adl/sandbox".replace(/\//g, "_") + '_' + SID + '_';
		}
		DAL.copyInstance(SID, URL.loginData.UID, function(newId)
		{
			if (newId)
			{
				respond(response, 200, newId);
				mailTools.newWorld(URL.loginData.UID, "copy", SID);
				DAL.getInstance(newId, function(data)
				{
					if (data)
						xapi.sendStatement(URL.loginData.UID, xapi.verbs.created, newId, data.title, data.description, SID);
				});
			}
			else //if the state to copy was not found in the dB, is it an example? if so, set the example data as the data for the new world
			{
				var statedata = null;
				var statemetadata = null;
				var newid = null;
				async.series([
						function getExampleData(cb)
						{
							require('./examples.js')
								.getExampleData(SID, function(data)
								{
									if (data)
									{
										statedata = data;
										statedata[statedata.length - 1].owner = URL.loginData.UID;
										cb();
									}
									else
									{
										cb(true);
									}
								})
						},
						function getExampleMetadata(cb)
						{
							require('./examples.js')
								.getExampleMetadata(SID, function(data)
								{
									if (data)
									{
										statemetadata = data;
										statemetadata.owner = URL.loginData.UID;
										statemetadata.create = new Date();
										statemetadata.clonedFrom = SID;
										delete statemetadata.publishSettings;
										delete statemetadata.publishedFrom;
										delete statemetadata.children;
										cb();
									}
									else
									{
										cb(true);
									}
								})
						},
						function createNewInstance(cb)
						{
							newid = "_adl_sandbox_" + makeid() + "_";
							DAL.createInstance(newid, statemetadata, function()
							{
								cb();
							})
						},
						function saveInstanceState(cb)
						{
							DAL.saveInstanceState(newid, statedata, function(ok)
							{
								logger.info(ok);
								cb();
							})
						},
						function saveThumbnail(cb)
						{
							var newThumbnail = datapath + libpath.sep + "States" + libpath.sep + newid + libpath.sep + "thumbnail.png";
							var oldThumbnail = 'public' + libpath.sep + "adl" + libpath.sep + 'sandbox' + libpath.sep + 'examples' + libpath.sep + SID + libpath.sep + "thumbnail.png";
							fs.readFile(oldThumbnail, function(err, data)
							{
								if (!data || err)
								{
									cb()
								}
								else
									fs.writeFile(newThumbnail, data, cb);
							});
						}
					],
					function copyExampleComplete(err)
					{
						if(err)
						{
							respond(response, 500, 'Error in trying to copy world');
							return;
						}
						
						var displayID = newid.replace("_adl_sandbox",
							global.configuration.appPath.replace(/\//g,"_"));
						if (err)
							respond(response, 500, 'Error in trying to copy world');
						else
							respond(response, 200, displayID);
					})
			}
		});
	}
	//Get list of files in State dir of a given world id
function GetStateList(URL, SID, response)
	{
		SID = SID ? SID : URL.query.SID;
		if (SID.length == 16)
		{
			SID = "/adl/sandbox".replace(/\//g, "_") + '_' + SID + '_';
		}
		DAL.getStatesFilelist(SID, function(fileList)
		{
			if (fileList) respond(response, 200, JSON.stringify(fileList));
			else respond(response, 500, 'Error in trying to retrieve backup list');
		});
	}
	//Get list of files in State dir of a given world id
function RestoreBackupState(URL, SID, response)
	{
		SID = SID ? SID : URL.query.SID;
		var statename = URL.query.statename;
		var backup = URL.query.backup;
		if (backup == "state")
		{
			respond(response, 500, 'Cannot restore from current state file');
			return;
		}
		if (SID.length == 16)
		{
			SID = "/adl/sandbox".replace(/\//g, "_") + '_' + SID + '_';
		}

		DAL.getInstance(SID, function(state)
		{
			if (!state)
			{
				respond(response, 500, 'State ID is incorrect');
				return;
			}
			//Make sure that the logged in user is the owner of the world they are trying to publish
			if (state.owner != URL.loginData.UID)
			{
				respond(response, 500, 'You must be the owner of a world you publish');
				return;
			}

			require('./reflector.js').closeInstance(SID);
			DAL.restoreBackup(SID, statename, function(success)
			{
				if (success) respond(response, 200, JSON.stringify("Success"));
				else respond(response, 500, 'Unable to restore backup');
			});
		});
	}
	//Publish the world to a new world
	//This is just a copy with some special settings
function Publish(URL, SID, publishdata, response)
{
	try
	{
		publishdata = JSON.parse(publishdata);
	}
	catch (e)
	{
		if (publishdata != 'null')
			respond(response, 500, 'Bad format');
	}
	if (!URL.loginData)
	{
		respond(response, 401, 'Anonymous users cannot copy instances');
		return;
	}
	SID = SID ? SID : URL.query.SID;
	if (SID.length == 16)
	{
		SID ="/adl/sandbox".replace(/\//g, "_") + '_' + SID + '_';
	}
	logger.debug(SID, 2);
	DAL.getInstance(SID, function(state)
	{
		if (!state)
		{
			respond(response, 500, 'State ID is incorrect');
			return;
		}
		//Make sure that the logged in user is the owner of the world they are trying to publish
		if (state.owner != URL.loginData.UID)
		{
			respond(response, 500, 'You must be the owner of a world you publish');
			return;
		}
		if (Object.keys(publishdata).length == 0)
		{
			respond(response, 500, 'Settings format incorrect');
			return;
		}
		var publishSettings = null;
		//The settings  for the published state. 
		//have to handle these in the client side code, with some enforcement at the server
		logger.info(publishdata, 2);
		if (publishdata)
		{
			var singlePlayer = publishdata.singlePlayer;
			var camera = publishdata.camera;
			var allowAnonymous = publishdata.allowAnonymous;
			var createAvatar = publishdata.createAvatar;
			var allowTools = publishdata.allowTools;
			var hidden = publishdata.hidden;
			var persistence = publishdata.persistence;
			var startPaused = publishdata.startPaused;
			var allowPlayPause = publishdata.allowPlayPause;
			publishSettings = {
				singlePlayer: singlePlayer,
				camera: camera,
				allowAnonymous: allowAnonymous,
				createAvatar: createAvatar,
				allowTools: allowTools,
				hidden: hidden,
				persistence: persistence,
				allowPlayPause:allowPlayPause,
				startPaused:startPaused
			};
		}
		require('./reflector.js').closeInstance(SID);
		//publish the state, and get the new id for the pubished state
		DAL.Publish(SID, publishSettings, function(newId)
		{
			if (publishSettings)
			{
				xapi.sendStatement(URL.loginData.UID, xapi.verbs.modified, newId);
			}
			
			//get the db entry for the published state
			DAL.getInstance(newId, function(statedata)
			{
				//this should really never happen
				if (!statedata)
				{
					respond(response, 401, 'State not found. State ' + SID);
					return;
				}
				if (publishdata)
				{
					if(publishdata.title)
						statedata.title = publishdata.title;
					if(publishdata.description)
						statedata.description = publishdata.description;
					//Should not need to check permission again
					DAL.updateInstance(newId, statedata, function()
					{
						respond(response, 200, newId);
					});
				}
				else
				{
					respond(response, 200, newId);
				}
			});
		});
	});
}

function SaveThumbnail(URL, SID, body, response)
{
	if (!URL.loginData)
	{
		respond(response, 401, 'Anonymous users cannot delete instances');
		return;
	}
	var data = body.image.replace(/^data:image\/\w+;base64,/, "");
	var buf = new Buffer(data, 'base64');
	SID = SID ? SID : URL.query.SID;
	var automatic = URL.query.auto;
	if (SID.length == 16)
	{
		SID = "/adl/sandbox".replace(/\//g, "_") + '_' + SID + '_';
	}
	DAL.getInstance(SID, function(state)
	{
		if (!state)
		{
			respond(response, 500, 'state does not exist');
			return
		}
		//if somehow we got an auto set thumb, but the world has one set explicitly, just return
		if (!state.userSetThumbnail && automatic === 'true')
		{
			respond(response, 200, '');
			return;
		}
		if (state.owner != URL.loginData.UID && URL.loginData.UID != global.adminUID)
		{
			respond(response, 401, 'User does not have permission to edit instance');
			return;
		}
		else
		{
			var filename = datapath + libpath.sep + "States" + libpath.sep + SID + libpath.sep + "thumbnail.png";
			fs.writeFile(filename, buf, function(err)
			{
				if (err)
					respond(response, 500, err.toString());
				else
				{
					if (automatic === 'true')
						respond(response, 200, '');
					else
					{
						//set state metadata that the file was explicitly set
						state.userSetThumbnail = true;
						logger.debug('userSetThumbnail');
						DAL.updateInstance(SID, state, function()
						{
							respond(response, 200, '');
						})
					}
				}
			});
		}
	});
}

function GetThumbnail(request, SID, response)
{
	SID = SID ? SID : request.url.query.SID;
	if (SID.length == 16)
	{
		SID = "/adl/sandbox".replace(/\//g, "_") + '_' + SID + '_';
	}
	global.FileCache.ServeFile(request, datapath + libpath.sep + "States" + libpath.sep + SID + libpath.sep + "thumbnail.png", response, request.url);
}

function GetCameras(SID, response, URL)
	{
		if (!URL.query.SID)
		{
			respond(response, 400, "No State Identifier");
			return;
		}
		function helper(node)
		{
			if (!node)
				return [];
			var ret = [];
			for (var i in node)
			{
				if (node[i].extends == 'SandboxCamera.vwf')
				{
					// based on engine.js:1622
					var childID = 'SandboxCamera-vwf-' + node[i].name;
					ret.push(
					{
						'name': node[i].properties.DisplayName,
						'id': childID
					});
				}
				ret.push.apply(ret, helper(node[i].children));
			}
			return ret;
		}
		var statePath = libpath.join(datapath, 'States', SID, 'state');
		fs.readFile(statePath,
		{
			encoding: 'utf8'
		}, function(err, state)
		{
			if (err || !state)
			{
				respond(response, 404, 'No state with given SID found');
				return;
			}
			else
			{
				// loop over all objects, check if camera
				try
				{
					state = JSON.parse(state);
				}
				catch (e)
				{
					logger.error(e);
					respond(response, 500, e.toString());
					return;
				}
				ServeJSON(helper(state), response, URL);
			}
		});
	}
	//Save an asset. the POST URL must contain valid name/pass and that UID must match the Asset Author
function DeleteState(URL, SID, response)
{
	if (!URL.loginData)
	{
		respond(response, 401, 'Anonymous users cannot delete instances');
		return;
	}
	DAL.getInstance(SID, function(state)
	{
		if (!state)
		{
			respond(response, 500, 'instance does not exist');
			return;
		}
		if (state.owner != URL.loginData.UID && URL.loginData.UID != global.adminUID)
		{
			respond(response, 401, 'User does not have permission to delete instance');
			return;
		}
		else
		{
			require('./reflector.js').closeInstance(SID);
			DAL.deleteInstance(SID, function()
			{
				xapi.sendStatement(URL.loginData.UID, xapi.verbs.destroyed, SID, state.title, state.description);
				respond(response, 200, 'deleted instance');
				return;
			});
		}
	});
}

function RenameFile(filename, newname, callback, sync)
	{
		if (!sync)
			fs.rename(filename, newname, callback);
		else
		{
			fs.renameSync(filename, newname);
			callback();
		}
	}
	//make a directory if the directory does not exist
function MakeDirIfNotExist(dirname, callback)
	{
		fs.exists(dirname, function(e)
		{
			if (e)
				callback();
			else
			{
				fs.mkdir(dirname, function()
				{
					callback();
				});
			}
		});
	}
	//hash a string
function hash(str)
	{
		return require('crypto')
			.createHash('md5')
			.update(str)
			.digest("hex");
	}
	//no point clogging up the disk with backups if the state does not change.
function CheckHash(filename, data, callback)
	{
		fs.readFile(filename, "utf8", function(err, file)
		{
			logger.info("hash is:" + hash(data) + " " + hash(file), 2);
			callback(hash(data) == hash(file));
		});
		return;
	}
	//Save an asset. the POST URL must contain valid name/pass and that UID must match the Asset Author
function DeleteAsset(URL, filename, response)
{
	var UID = URL.query.UID || (URL.loginData && URL.loginData.UID);
	var P = URL.query.P || (URL.loginData && URL.loginData.Password);
	CheckPassword(UID, P, function(e)
	{
		//Did no supply a good name pass pair
		if (!e)
		{
			respond(response, 401, 'Incorrect password when deleting Asset ' + filename);
			return;
		}
		else
		{
			//the asset is new
			if (!fs.existsSync(filename))
			{
				respond(response, 401, 'cant delete asset that does not exist' + filename);
				return;
			}
			else
			{
				//overwriting the asset;
				CheckAuthor(UID, filename, function(e)
				{
					//trying to delete existing file that user is not author of
					if (!e)
					{
						respond(response, 401, 'Permission denied to delete asset ' + filename);
						return;
					}
					else
					{
						fs.unlink(filename);
						respond(response, 200, 'Deleted asset ' + filename);
						return;
					}
				});
			}
		}
	});
}

function SaveFile(filename, data, response, sync)
{
	if (!sync)
	{
		fs.writeFile(filename, data, 'binary', function()
		{
			respond(response, 200, 'Saved ' + filename);
		});
	}
	else
	{
		fs.writeFileSync(filename, data, 'binary');
		respond(response, 200, 'Saved ' + filename);
	}
}

function _404(response)
{
	response.writeHead(404,
	{
		"Content-Type": "text/plain",
		"Cache-Control": "private, max-age=0, no-cache"
	});
	response.write("404 Not Found\n");
	response.end();
}

function RecurseDirs(startdir, currentdir, files)
	{
		for (var i = 0; i < files.length; i++)
		{
			if (fs.statSync(startdir + currentdir + libpath.sep + files[i])
				.isDirectory())
			{
				var o = {};
				var newfiles = fs.readdirSync(startdir + currentdir + libpath.sep + files[i] + libpath.sep);
				var tdir = currentdir ? currentdir + libpath.sep + files[i] : files[i];
				RecurseDirs(startdir, tdir, newfiles);
				newfiles.sort(function(a, b)
				{
					if (typeof a == "string" && typeof b == "string") return (a < b ? -1 : 1);
					if (typeof a == "object" && typeof b == "string") return 1;
					if (typeof a == "string" && typeof b == "object") return -1;
					return -1;
				});
				for (var j = 0; j < newfiles.length; j++)
					if (typeof newfiles[j] == "string")
						newfiles[j] = currentdir + libpath.sep + files[i] + libpath.sep + newfiles[j];
				o[currentdir ? currentdir + libpath.sep + files[i] : files[i]] = newfiles;
				files[i] = o;
			}
		}
	}
	//Generate a random ID for a instance
var ValidIDChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function makeid()
{
	var text = "";
	for (var i = 0; i < 16; i++)
		text += ValidIDChars.charAt(Math.floor(require('./cryptoRandom.js')
			.random() * ValidIDChars.length));
	return text;
}


function setState(URL, data, response)
{
	if (!URL.loginData)
	{
		respond(response, 401, 'Anonymous users cannot edit instances');
		return;
	}
	try
	{
		data = JSON.parse(data);
	}
	catch (e)
	{
		logger.error(e);
		respond(response, 500, 'parse error');
		return;
	}
	var sid = URL.query.SID;
	var statedata = {};
	sid = sid.replace(/\//g, '_');
	
	DAL.getInstance(sid, function(state)
	{
		if (!state)
		{
			respond(response, 401, 'State not found. State ' + sid);
			return;
		}
		if (state.owner == URL.loginData.UID || URL.loginData.UID == global.adminUID)
		{
			DAL.saveInstanceState(sid, data, function()
			{
				respond(response, 200, 'Saved world state ' + sid);
			});
		}
		else
		{
			respond(response, 401, 'Not authorized to edit state ' + sid);
		}
	});
}

function postAvatar(URL,body,response)
{
	if (!URL.loginData)
	{
		respond(response, 401, 'Anonymous users cannot post avatars');
		return;
	}
	
	var newDef = JSON.parse(body);
	
	DAL.updateUser(URL.loginData.UID,{avatarDef:newDef},function()
    {
        console.log('Avatar saved');
        respond(response, 200, 'OK');
        for(var i in global.instances.instances)
        {
        	
        	for(var j in global.instances.instances[i].clients)
        	{
        		var client  = global.instances.instances[i].clients[j];
        		
        		if(client.loginData.UID == URL.loginData.UID)
        		{
        			client.trigger("avatarUpdated");
        		}
        	}
        }
    })
}
function setStateData(URL, data, response)
{
	if (!URL.loginData)
	{
		respond(response, 401, 'Anonymous users cannot edit instances');
		return;
	}
	try
	{
		data = JSON.parse(data);
	}
	catch (e)
	{
		logger.error(e);
		respond(response, 500, 'parse error');
		return;
	}
	var sid = URL.query.SID;
	var statedata = {};
	sid = sid.replace(/\//g, '_');
	statedata.title = data.title;
	statedata.description = data.description;
	statedata.lastUpdate = (new Date());
	DAL.getInstance(sid, function(state)
	{
		if (!state)
		{
			respond(response, 401, 'State not found. State ' + sid);
			return;
		}
		if (state.owner == URL.loginData.UID || URL.loginData.UID == global.adminUID)
		{
			DAL.updateInstance(sid, statedata, function()
			{
				respond(response, 200, 'Created state ' + sid);
			});
		}
		else
		{
			respond(response, 401, 'Not authorized to edit state ' + sid);
		}
	});
}

function createState(URL, data, response)
	{
		if (!URL.loginData)
		{
			respond(response, 401, 'Anonymous users cannot create instances');
			return;
		}
		try
		{
			data = JSON.parse(data);
		}
		catch (e)
		{
			logger.error(e);
			respond(response, 500, 'parse error');
			return;
		}
		var statedata = {};
		statedata.objects = 0;
		statedata.owner = URL.loginData.UID;
		statedata.title = data.title;
		statedata.description = data.description;
		statedata.lastUpdate = (new Date());
		var id = "/adl/sandbox".replace(/\//g, "_") + '_' + makeid() + '_';
		DAL.createInstance(id, statedata, function()
		{
			var displayID = id.replace("_adl_sandbox",global.configuration.appPath.replace(/\//g,"_"));
			respond(response, 200, displayID);
			mailTools.newWorld(URL.loginData.UID, data.title, displayID);
			xapi.sendStatement(URL.loginData.UID, xapi.verbs.created, displayID, data.title, data.description);
		});
	}
	//Just return the state data, dont serve a response
function getState(SID, cb)
{
	SID = SID.replace(/[\\,\/]/g, '_');
	var basedir = datapath + libpath.sep;
	var statedir = (basedir + 'States/' + SID)
		.replace(safePathRE);
	var statefile = statedir + '/state'.replace(safePathRE);
	logger.info('serve state ' + statedir, 2);
	//sync case
	if (!cb)
	{
		if (fs.existsSync(statefile))
		{
			file = fs.readFileSync(statefile, 'utf8');
			try
			{
				return JSON.parse(file);
			}
			catch (e)
			{
				logger.error(e);
				return null;
			}
		}
		return require('./examples.js')
			.getState(SID);
	}
	//callback is provided. Use async functions
	if (cb)
	{
		fs.exists(statefile, function(exists)
		{
			if (exists)
			{
				fs.readFile(statefile, 'binary', function(err, file)
				{
					var data;
					try
					{
						data = JSON.parse(file)
					}
					catch (e)
					{
						logger.error(e);
					}
					cb(data);
				});
			}
			else
			{
				require('./examples.js')
					.getState(SID, cb);
			}
		});
	}
}

function Salt(URL, response)
{
	DAL.getUser(URL.query.UID, function(user)
	{
		if (user && user.Salt)
		{
			respond(response, 200, user.Salt);
		}
		else if (user)
		{
			//security measure. SALT endpoint should never return nothing, to prevent guessing that username is valid
			respond(response, 200, 'OBS#$%SGSDF##$%#DA');
		}
		else
		{
			//respond with a fake salt so attackers can't identify which is a valid account using this endpoint
			//note: probably a timing attack here
			respond(response, 401, GUID());
		}
	});
}

function getAnalytics(req, res)
	{
		var tempStr = analyticsObj ? "(function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){" +
			"(i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o)," +
			"m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)" +
			"})(window,document,'script','//www.google-analytics.com/analytics.js','ga');" +
			"ga('create', '" + analyticsObj.id + "', '" + analyticsObj.url + "');" +
			"ga('send', 'pageview');" : '//Analytics not found';
		res.writeHead(200,
		{
			'Content-Type': 'application/javascript'
		});
		res.end(tempStr);
	}
	//get the document directories
function dirTree(filename)
{
	var stats = fs.lstatSync(filename),
		info = {
			path: filename,
			name: libpath.basename(filename)
		};
	if (stats.isDirectory())
	{
		info.type = "folder";
		info.children = [];
		var dirinfo = fs.readdirSync(filename);
		for (var i = 0; i < dirinfo.length; i++)
		{
			var ret = dirTree(filename + '/' + dirinfo[i])
			if (ret)
				info.children.push(ret);
		}
		if (info.children.length > 0)
			return info;
	}
	if (filename.indexOf('index.html') > -1)
	{
		info.type = 'file';
		return info;
	}
}

function LogError(URL, error, response)
	{
		logger.error(JSON.stringify(JSON.parse(error), null, 4));
		response.writeHead(200,
		{});
		response.end();
	}
	//router
function serve(request, response)
{
	var URL = url.parse(request.url, true);
	URL.pathname = decodeURIComponent(URL.pathname)
	var serviceRoute = "vwfdatamanager.svc/";
	var pathAfterRoute = URL.pathname.substr(URL.pathname.toLowerCase()
		.lastIndexOf(serviceRoute) + serviceRoute.length);
	//format is /{anything}/vwfDataManager.svc/command/path/after/command
	//the first string after /vwfDataManager.svc/
	var command = pathAfterRoute.substr(0, pathAfterRoute.indexOf('/')) || pathAfterRoute;
	var pathAfterCommand = pathAfterRoute.substr(command.length);
	command = command.toLowerCase();
	//Load the session data
	sessions.GetSessionData(request, function(__session)
	{
		if(!URL.query) URL.query = {};
		URL.loginData = __session;
		//Allow requests to submit the username in the URL querystring if not session data
		var UID;
		if (URL.loginData)
			UID = URL.loginData.UID;
		if (URL.query.UID)
			UID = URL.query.UID;

		//rewrite the SID so the phycial path is always /adl/sandbox, even if clientside code computes a different instanceiID
		if(URL.query.SID)
		{
			 URL.query.SID = URL.query.SID.replace(global.appPath,'/adl/sandbox')
			 URL.query.SID = URL.query.SID.replace(global.appPath.replace(/\//g,'_'),'/adl/sandbox')
		}
		var SID = URL.query.SID;
		if (SID)
		{
			SID = SID.replace(/[\\,\/]/g, '_');
		}
		//Normalize the path for max/unix
		pathAfterCommand = pathAfterCommand.replace(/\//g, libpath.sep);
		var basedir = datapath + libpath.sep;
		//logger.info(basedir+"DataFiles"+ pathAfterCommand);
		logger.info(command, UID, 3);
		if (request.method == "GET")
		{
			switch (command)
			{
				case "updatepassword":
					{
						UpdatePassword(URL, response);
					}
					break;
				case "configuration":
					{ 
						//eventually should read some configuration data from the DB.
						//possilby merge this with world setting information
						ServeJSON({}, response, URL);
					}
					break;	
				case "forgotpassword":
					{
						passwordUtils.ResetPassword(UID, response);
					}
					break;
				case "docdir":
					{
						ServeJSON(dirTree("./public/docs"), response, URL);
					}
					break;
				case "3drsearch":
					{
						_3DR_proxy.proxySearch(URL, response);
					}
					break;
				case "3drpermission":
					{
						_3DR_proxy.proxyPermissions(URL, response);
					}
					break;
				case "3drmetadata":
					{
						_3DR_proxy.proxyMetadata(URL, response);
					}
					break;
				case "3drdownload":
					{
						_3DR_proxy.proxyDownload(URL, response);
					}
					break;
				case "3drtexture":
					{
						_3DR_proxy.proxyTexture(URL, response);
					}
					break;
				case "apppath":
					{
						respond(response, 200, global.appPath);
					}
					break;
				case "3drthumbnail":
					{
						_3DR_proxy.proxyThumbnail(URL, response);
					}
					break;
				case "getanalytics.js":
					{
						getAnalytics(request, response);
					}
					break;
				case "texture":
					{
						global.FileCache.ServeFile(request, basedir + "Textures" + libpath.sep + URL.query.UID, response, URL);
					}
					break;
				case "thumbnail":
					{
						GetThumbnail(request, SID, response);
					}
					break;
				case "cameras":
					{
						GetCameras(SID, response, URL);
					}
					break;
				case "datafile":
					{
						global.FileCache.ServeFile(request, basedir + "DataFiles" + pathAfterCommand, response, URL);
					}
					break;
				case "texturethumbnail":
					{
						global.FileCache.ServeFile(request, basedir + "Thumbnails" + libpath.sep + URL.query.UID, response, URL);
					}
					break;
				case "state":
					{
						ServeFile((basedir + "States/" + SID + '/state')
							.replace(safePathRE), response, URL, 'GetStateResult');
					}
					break;
				case "statedata":
					{
						if(!SID)
						{
							respond(response, 500, 'state not found');
							return;
						}
						DAL.getInstance(SID, function(state)
						{
							if (state)
								ServeJSON(state, response, URL);
							else
							{
								require('./examples.js')
									.getExampleMetadata(SID, function(data)
									{
										if (data)
										{
											ServeJSON(data, response, URL);
										}
										else
										{
											respond(response, 500, 'state not found');
										}
									})
							}
						});
					}
					break;
				case "statehistory":
					{
						logger.info("statehistory", 2);
						DAL.getHistory(SID, function(statehistory)
						{
							if (statehistory)
								ServeJSON(statehistory, response, URL);
							else
								respond(response, 500, 'state not found');
						});
					}
					break;
				case "copyinstance":
					{
						CopyInstance(URL, SID, response);
					}
					break;
				case "stateslist":
					{
						GetStateList(URL, SID, response);
					}
					break;
				case "restorebackup":
					{
						RestoreBackupState(URL, SID, response);
					}
					break;
				case "salt":
					{
						Salt(URL, response);
					}
					break;
				case "profile":
					{
						ServeProfile(UID, response, URL);
					}
					break;
				case "login":
					{
						InstanceLogin(response, URL);
					}
					break;
				case "sitelogin":
					{
						SiteLogin(response, URL);
					}
					break;
				case "sitelogout":
					{
						SiteLogout(request, response, URL);
					}
					break;
				case "logindata":
					{
						GetLoginData(response, URL);
					}
					break;
				case "logout":
					{
						InstanceLogout(response, URL);
					}
					break;
				case "profiles":
					{
						DAL.getUsers(function(users)
						{
							if (users)
								ServeJSON(users, response, URL);
							else
								respond(response, 500, 'users not found');
						});
					}
					break;
				case "inventory":
					{
						getInventory(URL, response);
					}
					break;
				case "inventoryitemassetdata":
					{
						getInventoryItemAssetData(URL, response);
					}
					break;
				case "inventoryitemmetadata":
					{
						getInventoryItemMetaData(URL, response);
					}
					break;
				case "states":
					{
						DAL.getInstances(function(state)
						{
							if (state)
								ServeJSON(state, response, URL);
							else
								respond(response, 500, 'state not found');
						});
					}
					break;
				case "textures":
					{
						// sort function
						function azFolderFile(a, b)
						{
							function isFolder(x){
								return !!x.name && !!x.contents;
							}

							if( isFolder(a) === isFolder(b) ){
								return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
							}
							else if( isFolder(a) && !isFolder(b) ){
								return -1;
							}
							else if( !isFolder(a) && isFolder(b) ){
								return 1;
							}
							else {
								return 0;
							}
						}

						// enumerate folder contents recursively
						function getFiles(path, callback)
						{
							// get direct dir contents
							fs.readdir(path, function(err, files)
							{
								// if it's actually a texture, return
								if(err && err.code === 'ENOTDIR' && /\.(?:bmp|jpg|png|gif|dds|tiff)$/.test(path))
								{
									var UID = libpath.relative(libpath.join(basedir, 'Textures'), path);
									var ret = {
										name: libpath.basename(path),
										url: './vwfdatamanager.svc/texture?UID='+UID
									};

									fs.stat( libpath.join(basedir,'Thumbnails',UID), function(err){
										if(!err){
											ret.thumbnail = './vwfdatamanager.svc/texturethumbnail?UID='+UID;
										}
										else {
											ret.thumbnail = null;
										}

										if(ret.width !== undefined && ret.height !== undefined)
											callback(null, ret);
									});

									imgSize(path, function(err, dimensions)
									{
										if(!err && dimensions){
											ret.width = dimensions.width;
											ret.height = dimensions.height;
										}
										else {
											ret.width = ret.height = null;
										}

										if(ret.thumbnail !== undefined)
											callback(null, ret);
									});
								}
								// if it's some other error, return
								else if(err){
									callback(err);
								}
								// if it's a dir
								else
								{
									var ret = {name: libpath.basename(path), contents: []};
									var childrenFinished = 0; // keep track of how many children are still pending

									// loop over children
									for(var i=0; i<files.length; i++)
									{
										// recurse
										getFiles(libpath.join(path, files[i]), function(err, item)
										{
											// fail silently, append result to parent otherwise
											if(!err){
												ret.contents.push(item);
											}

											// call callback when last child finishes
											if(++childrenFinished === files.length){
												ret.contents.sort(azFolderFile);
												callback(null, ret);
											}
										});
									}
								}
							});
						}

						if (global.textures)
						{
							ServeJSON(global.textures, response, URL);
						}
						else
						{
							getFiles( libpath.join(basedir, 'Textures'), function(err, files)
							{
								if(err){
									console.error(err);
								}
								else {
									global.textures = files.contents;
									ServeJSON(files.contents, response, URL);
								}
							});
						}

					}
					break;
				case "globalassets":
					{
						getGlobalInventory(URL, response);
					}
					break;
				case "globalassetassetdata":
					{
						getGlobalInventoryItemAssetData(URL, response);
					}
					break;
				case "globalassetmetadata":
					{
						getGlobalInventoryItemMetaData(URL, response);
					}
					break;
				case "getassets":
					{
						if (!URL.query.SID)
						{
							respond(response, 400, "No State Identifier");
							return;
						}
						assetPreload.getAssets(request, response, URL);
					}
					break;
				case "saspath":
					{
						if(global.configuration.hostAssets){
							response.send(global.configuration.assetAppPath);
						}
						else {
							response.send(global.configuration.remoteAssetServerURL);
						}
					}
					break;
				case "geteditorcss":
					{
						var sass = null;
						try{
							sass = require('node-sass');
						}catch(e)
						{
							console.warn("sass not installed, serving locally");
						}
						
						if(sass)
						{
							sass.render({
								file: libpath.join(__dirname, '../client/lib/vwf/view/editorview/css/Editorview.scss'),
								includePaths: [libpath.join(__dirname, '../client/lib/vwf/view/editorview/css/')],
								sourceComments: true,
								functions: {
									'getImgPath()': function(){
										return new sass.types.String('../vwf/view/editorview');
									}
								}
							}, function(err,result){
								if(err){
									logger.error('Error compiling sass:', err);
									response.sendStatus(500);
								}
								else {
									response.set('Content-Type', 'text/css');
									response.send(result.css);
								}
							});
						}else{
							FileCache.ServeFile(request,libpath.join(__dirname, '../client/lib/vwf/view/editorview/css/built.css'),response,URL)
						}
					}
					break;
				default:
					{
						_404(response);
						return;
					}
			}
		}
		if (request.method == "POST")
		{
			var body = request.body;
			if (body == '')
			{
				respond(response, 500, "Error in post: data is null");
				return;
			}
			if (command == 'uploadtemp')
			{
				fs.writeFileSync('./tempupload', JSON.stringify(body));
			}
			//Have to do this here! throw does not work quite as you would think 
			//with all the async stuff. Do error checking first.
			if (command != 'thumbnail' && command != '3drupload') //excpetion for the base64 encoded thumbnails
			{
				try
				{
					body = JSON.stringify(body);
				}
				catch (e)
				{
					respond(response, 500, "Error in post: data is not json");
					return;
				}
			}
			switch (command)
			{
				case "error":
					{
						LogError(URL, body, response);
					}
					break;
				case "thumbnail":
					{
						SaveThumbnail(URL, SID, body, response);
					}
					break;
				case "createstate":
					{
						createState(URL, body, response);
					}
					break;
				case "statedata":
					{
						setStateData(URL, body, response);
					}
					break;
				case "state":
					{
						setState(URL, body, response);
					}
					break;	
				case "globalasset":
					{
						addGlobalInventoryItem(URL, body, response);
					}
					break;
				case "profile":
					{
						SaveProfile(URL, body, response);
					}
					break;
				case "createprofile":
					{
						CreateProfile(URL, body, response);
					}
					break;
				case "inventoryitem":
					{
						addInventoryItem(URL, body, response);
					}
					break;
				case "inventoryitemmetadata":
					{
						updateInventoryItemMetadata(URL, body, response);
					}
					break;
				case "publish":
					{
						Publish(URL, SID, body, response);
					}
					break;
				case "avatar":
					{
						postAvatar(URL, body, response);
					}
					break;	
				case "3drupload":
					{
						_3DR_proxy.proxyUpload(request, response, URL);
					}
					break;
				default:
					{
						logger.warn("POST", 2);
						_404(response);
						return;
					}
			}
		}
		if (request.method == "DELETE")
		{
			var body = request.body;
			switch (command)
			{
				case "state":
					{
						DeleteState(URL, SID, response);
					}
					break;
				case "inventoryitem":
					{
						deleteInventoryItem(URL, response);
					}
					break;
				case "globalasset":
					{
						deleteGlobalInventoryItem(URL, response);
					}
					break;
				case "profile":
					{
						DeleteProfile(URL, basedir + "Profiles" + libpath.sep + UID, response);
					}
					break;
				default:
					{
						logger.warn("DELETE", 2);
						_404(response);
						return;
					}
			}
		}
	});
}
exports.serve = serve;
exports.getState = getState;
exports.setDataPath = function(p)
{
	p = libpath.resolve(p);
	datapath = p;
}
exports.setDAL = function(p)
{
	DAL = p;
	assetPreload.setSandboxAPI(this);
}
exports.getDataPath = function()
{
	return datapath;
}
exports.setAnalytics = function(obj)
{
	analyticsObj = obj;
};
