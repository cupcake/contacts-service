//= require marbles/http
//= require marbles/http/middleware
//= require tent-client
//= require_self
//= require ./service_config
//= require ./service_boot

var TentContactsService = {};

(function () {

  "use strict";

	// Simple localStorage abstration
	var Cache = function () {
		this.namespace = 'c';
		this.__cache = {};
	};
	Cache.prototype.expandKey = function (key) {
		return this.namespace +':'+ key;
	};
	Cache.prototype.set = function (key, val) {
		return new Promise(function (resolve) {
			if ( typeof localStorage === "undefined" ) {
				this.__cache[key] = val;
				resolve();
			} else {
				window.localStorage.setItem(this.expandKey(key), JSON.stringify(val));
				resolve();
			}
		}.bind(this));
	};
	Cache.prototype.get = function (key) {
		return new Promise(function (resolve) {
			if ( typeof localStorage === "undefined" ) {
				resolve(this.__cache[key]);
			} else {
				resolve(JSON.parse(window.localStorage.getItem(this.expandKey(key))));
			}
		}.bind(this));
	};
	Cache.prototype.remove = function (key) {
		return new Promise(function (resolve) {
			if ( typeof localStorage === "undefined" ) {
				delete this.__cache[key];
				resolve();
			} else {
				window.localStorage.removeItem(this.expandKey(key));
				resolve();
			}
		}.bind(this));
	};

	// Simple scoring algorithm
	var StringScore = function (str, abbr) {
		str = str.toLowerCase();
		abbr = abbr.toLowerCase();

		if (str === abbr) {
			return 1;
		}

		var index = str.indexOf(abbr);

		if (index === -1) {
			return 0;
		}

		if (index === 0) {
			return 1;
		}

		return abbr.length / str.length;
	};

  var Contacts = TentContactsService;
	Contacts.displayName = "TentContacts (Daemon)";

	var __syncInterval;

	var __listeners = {};
	var __listenersMapping = {};

	// listen to postMessage
	Contacts.run = function () {
		if (typeof window === "undefined") {
			return;
		}
		window.addEventListener("message", Contacts.receiveMessage, false);
	};

	Contacts.init = function (entity, serverMetaPost, credentials, callback) {
		return new Promise(function (resolve) {
			if (Contacts.ready) {
				return;
			}
			Contacts.ready = true;
			Contacts.setCredentials(entity, serverMetaPost, credentials);
			Contacts.cache = new Cache();
			__syncInterval = setInterval(Contacts.sync, 14400000); // sync every 4 hours
			Contacts.sync();
			resolve();
		}).then(callback).catch(function (err) {
			setTimeout(function () { throw err; }, 0);
		});
	};

	Contacts.deinit = function () {
		return Promise.all([
			Contacts.cache.remove('cursor'),
			Contacts.getCacheManifest().then(function (manifest) {
				return Promise.all([
					Contacts.cache.remove("manifest"),
					new Promise(function (resolve) {
						for (var entity in manifest) {
							if (!manifest.hasOwnProperty(entity)) {
								continue;
							}
							Contacts.cache.remove(entity);
						}
						resolve();
					})
				]);
			})
		]).then(function () {
			Contacts.client = null;
			Contacts.cache = null;
			clearInterval(__syncInterval);
		}).catch(function (err) {
			setTimeout(function () { throw err; }, 0);
		});
	};

	Contacts.receiveMessage = function (event) {
		if (typeof window !== "undefined") {
			if (!Contacts.allowedOrigin.test(event.origin)) {
				return; // ignore everything from "un-trusted" hosts
			}
		}

		// each message must be an object
		// with `name`, `args`, and `id` members
		// corresponding to the function to be called,
		// the args to call it with, and the id with
		// which the response should be associated.

		var callback = function (res, name) {
			var data = {
				id: event.data.id,
				res: res
			};
			if (name) {
				data.name = name;
			}
			event.source.postMessage(data, event.origin);
		};

		switch (event.data.name) {
			case "find":
				Contacts.find.apply(null, event.data.args.concat([callback]));
			break;

			case "search":
				Contacts.search.apply(null, event.data.args.concat([callback]));
			break;

			case "onChange":
				Contacts.onChange.apply(null, event.data.args.concat([callback]));
			break;

			case "offChange":
				Contacts.offChange.apply(null, event.data.args.concat([callback]));
			break;

			case "init":
				Contacts.init.apply(null, (event.data.args || []).concat([callback]));
			break;

			case "deinit":
				Contacts.deinit.apply(null, event.data.args || []);
				callback();
			break;
		}
	};

	Contacts.setCredentials = function (entity, serverMetaPost, credentials) {
		Contacts.client = new TentClient(entity, {
			serverMetaPost: serverMetaPost,
			credentials: credentials
		});
	};

	// fetch new relationships and cached update names and avatars
	Contacts.sync = function () {
		if (!Contacts.client) {
			throw new Error(Contacts.displayName +": Can not sync without Tent client!");
		}

		return Contacts.cache.get('cursor').then(function (cursor) {
			if (cursor && ((Date.now() - cursor.updated_at) > 86400000)) {
				// refresh everything every 24 hours
				cursor = null;
			}
			if (!cursor) {
				cursor = {
					since: 0,
					updated_at: Date.now()
				};
			}

			var handleSuccess = function (res) {
				if (!res.posts.length) {
					// empty response
					return;
				}

				// update cursor
				var latestPost = res.posts[0];
				cursor = {
					since: latestPost.received_at +" "+ latestPost.version.id,
					updated_at: Date.now()
				};

				return Contacts.cache.set('cursor', cursor).then(function () {
					// cache returned profiles
					return Promise.all(Object.keys(res.profiles).map(function (entity) {
						var profile = res.profiles[entity];
						var name = profile.name || entity.replace(/^https?:\/\//, '');
						var avatarDigest = profile.avatar_digest;
						return Contacts.cacheProfile(entity, name, avatarDigest);
					}));
				}).then(function () {
					// fetch the next page
					return Contacts.fetch({
						since: cursor.since
					}).then(handleSuccess);
				});
			};

			return Contacts.fetch({
				since: cursor.since
			}).then(handleSuccess);
		}).catch(function (err) {
			setTimeout(function () { throw err; }, 0);
		});
	};

	Contacts.fetch = function (params) {
		return new Promise(function (resolve, reject) {
			params.types = ["https://tent.io/types/relationship/v0"];
			params.profiles = "mentions";
			Contacts.client.getPostsFeed({
				params: [params],
				callback: {
					success: resolve,
					failure: function (res, xhr) {
						reject(new Error(Contacts.displayName +": Failed to fetch relationships - "+ xhr.status +": "+ JSON.stringify(res)));
					}
				}
			});
		});
	};

	// returns cached object with entity URIs
	// as keys and profile names as values
	// (used for searching).
	Contacts.getCacheManifest = function () {
		if (!Contacts.cache) {
			return Promise.resolve(null);
		}
		return Contacts.cache.get("manifest");
	};

	Contacts.setCacheManifest = function (newManifest) {
		return Contacts.cache.get("manifest").then(function (manifest) {
			manifest = Marbles.Utils.extend({}, manifest || {}, newManifest);
			return Contacts.cache.set("manifest", manifest);
		});
	};

	Contacts.cacheProfile = function (entity, name, avatarDigest) {
		return Contacts.cache.get(entity).then(function (profile) {
			var newProfile = {
				name: name
			};
			if (avatarDigest) {
				newProfile.avatarDigest = avatarDigest;
			}
			return Contacts.cache.set(entity, newProfile).then(function () {
				Contacts.getCacheManifest().then(function (manifest) {
					manifest = manifest || {};
					manifest[entity] = name;
					return Contacts.setCacheManifest(manifest).then(function () {
						if (!profile || profile.name !== newProfile.name || profile.avatarDigest !== newProfile.avatarDigest) {
							Contacts.profileChanged(entity, newProfile, profile);
						}
					});
				});
			});
		});
	};

	Contacts.getCachedProfile = function (entity) {
		return Contacts.cache.get(entity);
	};

	Contacts.profileChanged = function (entity, newProfile, oldProfile) {
		if (!__listeners[entity]) {
			return;
		}

		if (newProfile) {
			newProfile.entity = entity;
		}

		if (oldProfile) {
			oldProfile.entity = entity;
		}

		var _ref = __listeners[entity];
		for (var eventID in _ref) {
			if (!_ref.hasOwnProperty(eventID)) {
				continue;
			}
			_ref[eventID](newProfile, "onChange");
		}
	};

	/*
	 * public API
	 */

	// find contact by entity
	Contacts.find = function (entity, callback) {
		Contacts.getCachedProfile(entity).then(function (profile) {
			profile = profile || {
				name: entity.replace(/https?:\/\//, '')
			};
			profile.entity = entity;
			callback(profile);
		});
	};

	// find contacts with name or entity matching queryString
	Contacts.search = function (queryString, callback) {
		Contacts.getCacheManifest().then(function (manifest) {
			manifest = manifest || {};
			return Promise.all(Object.keys(manifest).map(function (entity) {
				var name = manifest[entity];
				var score = (StringScore(entity, queryString) + StringScore(name, queryString)) / 2;
				return [entity, score];
			}).filter(function (item) {
				var score = item[1];
				return score > 0;
			}).map(function (item) {
				var entity = item[0];
				var score = item[1];
				return Contacts.cache.get(entity).then(function (profile) {
					profile.score = score;
					profile.entity = entity;
					return profile;
				});
			})).then(function (profiles) {
				// sort matched profiles in order of score (high to low)
				return profiles.sort(function (a, b) {
					a = a.score;
					b = b.score;
					if (a > b) {
						return -1;
					}
					if (a < b) {
						return 1;
					}
					return 0;
				});
			});
		}).then(callback).catch(function (err) {
			setTimeout(function () { throw err; }, 0);
		});
	};

	Contacts.onChange = function (eventID, entity, callback) {
		__listeners[entity] = __listeners[entity] || {};
		__listeners[entity][eventID] = callback;
		__listenersMapping[eventID] = entity;
	};

	Contacts.offChange = function (eventID) {
		var entity = __listenersMapping[eventID];
		delete __listenersMapping[eventID];
		__listeners[entity] = __listeners[entity] || {};
		delete __listeners[entity][eventID];
		if (Object.keys(__listeners[entity]).length === 0) {
			delete __listeners[entity];
		}
	};

})();
