


/**
 * Connection establisher.
 *
 * @constructor
 * @param {number} port Connection port.
 * @param {string=} opt_host Хост Connection host.
 */
hsocket.Connection = function(port, opt_host) {

  var self = this;
  var isFlushRequested = false;

  function reconnect() {
    self.__connect();
  }

  function fallback() {
    self.__fallback();
  }

  function flush() {
    isFlushRequested = false;
    self.__flush();
  }

  /**
   * @type {!Array.<!Arguments>}
   */
  this.__destinations = [arguments];

  /**
   * @type {number}
   */
  this.__destinationIndex = 0;

  /**
   * @type {net.Socket}
   */
  this.__socket = null;

  /**
   * @type {!Array.<!hsocket.PacketHandler>|!ds.queue.Queue}
   */
  this.__requestHandlers = new ds.queue.Queue();

  /**
   * @type {!Array.<string>|!ds.queue.Queue}
   */
  this.__processQueue = new ds.queue.Queue();

  /**
   * @type {!Array.<string>}
   */
  this.__writeQueue = [];

  /**
   * @type {Buffer}
   */
  this.__readBuffer = new Buffer(0);

  /**
   * @type {boolean}
   */
  this.__isConnected = false;

  /**
   *
   */
  this.__nextTickFlush = function() {
    if (!isFlushRequested) {
      isFlushRequested = true;

      process.nextTick(flush);
    }
  };

  /**
   *
   */
  this.__handleConnection = function() {
    self.__readBuffer = new Buffer(0);

    self.__isConnected = true;

    while (self.__processQueue.length > 0) {
      self.__writeQueue.push(self.__processQueue.shift());
    }

    if (self.__requestHandlers.length > 0) {
      var currentHandler = self.__requestHandlers.head();
      currentHandler.reset();

      if (currentHandler === self._getHandshakeHandler()) {
        self.__nextTickFlush();
      } else {
        self.__handshake();
      }
    } else {
      self.__handshake();
    }
  };

  /**
   * @param {Buffer} chunk Data packet.
   */
  this.__handleData = function(chunk) {
    if (self.__readBuffer.length > 0) {
      self.__readBuffer = Buffer.concat([self.__readBuffer, chunk]);
    } else {
      self.__readBuffer = chunk;
    }
    self.__processData();
  };

  /**
   *
   */
  this.__handleClose = function() {
    if (self.__isConnected) {
      setTimeout(reconnect, 1000);
    } else {
      setTimeout(fallback, 1000);
    }

    self.__isConnected = false;

    if (self.__socket !== null) {
      self.__socket.removeAllListeners();
      self.__socket.destroy();
      self.__socket = null;
    }
  };

  this.__connect();
};


/**
 * Registers a fallback destination.
 *
 * @param {number} port Fallback connection port.
 * @param {string=} opt_host Fallback connection host.
 */
hsocket.Connection.prototype.registerFallback = function(port, opt_host) {
  this.__destinations.push(arguments);
};


/**
 * @return {boolean} В процессе ли звпрос.
 */
hsocket.Connection.prototype.isRunning = function() {
  return this.__processQueue.length > 0;
};


/**
 * Destroys connection.
 */
hsocket.Connection.prototype.destroy = function() {
  if (this.__socket !== null) {
    this.__socket.removeAllListeners();
    this.__socket.end(this._getDestoryPayload());
    this.__socket = null;
  }
};


/**
 * @param {Buffer} payload Data.
 * @param {!hsocket.PacketHandler} handler Packet handler.
 */
hsocket.Connection.prototype._send = function(payload, handler) {
  this.__writeQueue.push(payload);
  this.__requestHandlers.push(handler);

  this.__nextTickFlush();
};


/**
 * @return {string} Initializes request.
 */
hsocket.Connection.prototype._getHandshakePayload = function() {
  return '';
};


/**
 * @return {string} Initializes request.
 */
hsocket.Connection.prototype._getDestoryPayload = function() {
  return '';
};


/**
 * @return {hsocket.PacketHandler} Initializes packet.
 */
hsocket.Connection.prototype._getHandshakeHandler = function() {
  return null;
};


/**
 *
 */
hsocket.Connection.prototype.__processData = function() {
  var cursor = new hsocket.Cursor();

  while (cursor.isParsed() && this.__requestHandlers.length > 0) {
    var handler = this.__requestHandlers.head();

    if (handler.process(cursor, this.__readBuffer)) {
      this.__requestHandlers.shift();
      this.__processQueue.shift();
    }
  }

  this.__readBuffer = this.__readBuffer.slice(cursor.getPosition());
};


/**
 *
 */
hsocket.Connection.prototype.__fallback = function() {
  this.__destinationIndex =
      (this.__destinationIndex + 1) % this.__destinations.length;

  this.__connect();
};


/**
 *
 */
hsocket.Connection.prototype.__connect = function() {
  var args = this.__destinations[this.__destinationIndex];

  this.__socket = new net.Socket();
  this.__socket.addListener('connect', this.__handleConnection);
  this.__socket.addListener('data', this.__handleData);
  this.__socket.addListener('close', this.__handleClose);
  this.__socket.addListener('error', function(err) {
    console.error('(hsocket) Connection failed', args, err);
  });

  this.__socket.connect.apply(this.__socket, args);
};


/**
 *
 */
hsocket.Connection.prototype.__flush = function() {
  if (this.__socket !== null &&
      this.__isConnected &&
      this.__writeQueue.length > 0) {

    var i = 0;
    var l = this.__writeQueue.length;

    while (i < l) {
      this.__processQueue.push(this.__writeQueue[i]);
      this.__socket.write(this.__writeQueue[i]);
      i += 1;
    }

    this.__writeQueue.length = 0;
  }
};


/**
 *
 */
hsocket.Connection.prototype.__handshake = function() {
  var handshakePayload = this._getHandshakePayload();
  if (handshakePayload.length > 0) {
    var handshakeHandler = this._getHandshakeHandler();
    if (handshakeHandler !== null) {
      handshakeHandler.reset();

      this.__requestHandlers.unshift(handshakeHandler);
      this.__writeQueue.unshift(handshakePayload);
    }
  }

  this.__nextTickFlush();
};
