let ioInstance = null;

const setIo = (io) => {
  ioInstance = io;
};

const getIo = () => ioInstance;

const emit = (event, payload, room) => {
  if (!ioInstance) {
    console.warn(`[socket] io no inicializado, evento '${event}' descartado`);
    return;
  }
  try {
    const target = room ? ioInstance.to(room) : ioInstance;
    target.emit(event, payload);
  } catch (e) {
    console.warn(`[socket] error al emitir '${event}':`, e.message);
  }
};

module.exports = { setIo, getIo, emit };
