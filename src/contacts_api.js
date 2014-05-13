(function () {

	"use strict";

	var Contacts = window.TentContacts = {};
	Contacts.displayName = "window.TentContacts";

	Contacts.ready = false;

	Contacts.__id_counter = 0;

	Contacts.__callbacks = {};
	Contacts.__callbackBindings = {};

	Contacts.__listeners = {};
	Contacts.__listenerIDMapping = {};
	Contacts.__listenerIDCounter = 0;
	Contacts.__listenerReqIDMapping = {};

	// list of requests created before daemon activated.
	Contacts.sendQueue = [];

	Contacts.runIframe = function (sendPing) {
		if (Contacts.iframe) {
			// Don't load more than once
			return;
		}

		if ( !Contacts.daemonURL ) {
			throw new Error(Contacts.displayName +".daemonURL must be set!");
		}

		window.addEventListener("message", Contacts.receiveMessage, false);

		var iframe = document.createElement('iframe');
		iframe.src = Contacts.daemonURL;

		// hide it
		iframe.style.width = '0px';
		iframe.style.height = '0px';
		iframe.style.margin = '0px';
		iframe.style.padding = '0px';
		iframe.style.border = 'none';

		// insert into the DOM
		document.body.appendChild(iframe);

		Contacts.iframe = iframe;

		iframe.addEventListener("load", sendPing, false);
	};

	Contacts.runSharedWorker = function (sendPing) {
		if ( !Contacts.workerURL ) {
			setTimeout(function () {
				throw new Error(Contacts.displayName +".workerURL must be set! Falling back to iframe.");
			}, 0);
			this.runIframe();
			return;
		}

		var initFn = function (e) {
			if (e.data.name === "ping") {
				sendPing();
				worker.removeEventListener("message", initFn, false);
			}
		};

		var worker = new SharedWorker(Contacts.workerURL);
		Contacts.worker = worker;
		worker.port.addEventListener("message", Contacts.receiveMessage, false);
		worker.port.addEventListener("message", initFn, false);
		worker.onerror = function (event) {
			throw new Error(event.message + " (" + event.filename + ":" + event.lineno + ")");
		};
		worker.port.start();
	};

	Contacts.run = function () {
		function sendPing() {
			var initData = {
				name: 'init',
				id: 'init',
				args: [Contacts.entity, Contacts.serverMetaPost, Contacts.credentials],
				callback: Contacts.daemonReady
			};
			Contacts.deliverMessage(initData);
		}

		if (window.SharedWorker) {
			this.runSharedWorker(sendPing);
		} else {
			this.runIframe(sendPing);
		}
	};

	Contacts.stop = function (callback) {
		Contacts.credentials = null;
		Contacts.entity = null;
		Contacts.sendQueue = [];
		Contacts.ready = false;
		Contacts.deliverMessage({
			name: 'deinit',
			id: 'deinit',
			callback: callback
		});
	};

	Contacts.daemonReady = function () {
		Contacts.ready = true;

		// Deliver backlog
		for (var i = 0, _ref = Contacts.sendQueue, _len = _ref.length; i < _len; i++) {
			Contacts.deliverMessage(_ref[i]);
		}
		Contacts.sendQueue = [];
	};

	Contacts.sendMessage = function (name, args, callback, thisArg) {
		var data = {
			name: name,
			args: args,
			id: "req."+ Contacts.__id_counter++,
			callback: callback,
			thisArg: thisArg || null
		};

		if (Contacts.ready) {
			Contacts.deliverMessage(data);
		} else {
			Contacts.sendQueue.push(data);
		}

		return data.id;
	};

	Contacts.deliverMessage = function (data) {
		Contacts.__callbacks[data.id] = data.callback;
		Contacts.__callbackBindings[data.id] = data.thisArg;
		delete data.callback;
		delete data.thisArg;

		if (Contacts.iframe) {
			Contacts.iframe.contentWindow.postMessage(data, Contacts.daemonURL);
		} else {
			Contacts.worker.port.postMessage(data);
		}
	};

	Contacts.receiveMessage = function (event) {
		if (Contacts.iframe) {
			if (Contacts.daemonURL.substr(0, event.origin.length) !== event.origin) {
				return; // ignore everything not from the iframe
			}
		}

		if (event.data.name === 'ping') {
			// used by SharedWorker
			// let other event handler get this one
			return;
		}

		if (event.data.name === 'ready') {
			// API daemon is ready
			Contacts.daemonReady();
			return;
		}

		if (event.data.name === 'console') {
			window.console.log(event.data.args);
			return;
		}

		var deleteCallback = true;
		if (event.data.name === 'onChange') {
			deleteCallback = false;
		}

		// each message must be an object
		// with `id`, and `res` members

		if (!event.data.id) {
			throw new Error(Contacts.displayName +".receiveMessage: Missing id: "+ JSON.stringify(event.data));
		}

		var callback = Contacts.__callbacks[event.data.id];
		if (deleteCallback) {
			delete Contacts.__callbacks[event.data.id];
		}

		var thisArg = Contacts.__callbackBindings[event.data.id];
		if (deleteCallback) {
			delete Contacts.__callbackBindings[event.data.id];
		}

		if (typeof callback === null) {
			// Allow callback to be explicitly omitted
			return;
		}

		if (typeof callback !== 'function') {
			throw new Error(Contacts.displayName +".receiveMessage: Invalid callback: "+ JSON.stringify(callback) +" for event: "+ JSON.stringify(event.data));
		}

		callback.call(thisArg, event.data.res);
	};

	Contacts.find = function (entity, callback, thisArg) {
		Contacts.sendMessage('find', [entity], callback, thisArg);
	};

	Contacts.search = function (queryString, callback, thisArg) {
		Contacts.sendMessage('search', [queryString], callback, thisArg);
	};

	Contacts.onChange = function (entity, callback, thisArg) {
		var _listeners = Contacts.__listeners,
				_listenerIDMapping = Contacts.__listenerIDMapping;
		_listeners[entity] = _listeners[entity] || [];

		var id = null;
		var _ref = _listeners[entity];
		for (var i = 0, _len = _ref.length; i < _len; i++) {
			if (_ref[i].callback === callback && _ref[i].thisArg === thisArg) {
				id = _ref[i].id;
				break;
			}
		}
		if (id === null) {
			id = Contacts.__listenerIDCounter++;
			_ref.push({
				id: id,
				callback: callback,
				thisArg: thisArg
			});
		}

		_listenerIDMapping[id] = entity;

		var reqId = Contacts.sendMessage('onChange', [id, entity], callback, thisArg);
		var _reqIdMapping = Contacts.__listenerReqIDMapping;
		_reqIdMapping[id] = reqId;

		return id;
	};

	Contacts.offChange = function (id, callback, thisArg) {
		var _listeners = Contacts.__listeners,
				_entity = Contacts.__listenerIDMapping[id],
				_reqIDMapping = Contacts.__listenerReqIDMapping,
				_entityListeners = (_listeners[_entity] || []),
				_tmp, i, _len;

		Contacts.sendMessage('offChange', [id], callback || null, thisArg);

		_tmp = [];
		for (i = 0, _len = _entityListeners.length; i < _len; i++) {
			if (_entityListeners[i].id !== id) {
				_tmp.push( _entityListeners[i] );
			}
		}
		_listeners[_entity] = _tmp;

		if (_tmp.length === 0) {
			delete _listeners[_entity];
		}

		var reqId = _reqIDMapping[id];
		delete Contacts.__callbacks[reqId];
		delete Contacts.__callbackBindings[reqId];
		delete _reqIDMapping[id];
	};

})();
