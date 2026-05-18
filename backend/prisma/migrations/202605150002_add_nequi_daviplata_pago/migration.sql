ALTER TABLE `Pago`
  MODIFY `metodo` ENUM(
    'EFECTIVO',
    'NEQUI',
    'DAVIPLATA',
    'TRANSFERENCIA',
    'TARJETA',
    'YAPE',
    'PLIN',
    'OTRO'
  ) NOT NULL;
