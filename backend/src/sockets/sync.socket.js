module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id);

    socket.on('join-lavanderia', (lavanderiaId) => {
      socket.join(lavanderiaId);
    });

    socket.on('pedido-actualizado', (data) => {
      socket.to(data.lavanderiaId).emit('pedido-actualizado', data);
    });

    socket.on('nuevo-pedido', (data) => {
      socket.to(data.lavanderiaId).emit('nuevo-pedido', data);
    });

    socket.on('estado-cambiado', (data) => {
      socket.to(data.lavanderiaId).emit('estado-cambiado', data);
    });

    socket.on('servicio-creado', (data) => {
      socket.to(data?.lavanderiaId ?? '').emit('servicio-creado', data);
    });
    socket.on('servicio-actualizado', (data) => {
      socket.to(data?.lavanderiaId ?? '').emit('servicio-actualizado', data);
    });
    socket.on('servicio-eliminado', (data) => {
      socket.to(data?.lavanderiaId ?? '').emit('servicio-eliminado', data);
    });

    socket.on('disconnect', () => {
      console.log('Cliente desconectado:', socket.id);
    });
  });
};
