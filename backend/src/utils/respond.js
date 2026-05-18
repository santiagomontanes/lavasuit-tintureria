exports.ok = (res, data, status = 200) => res.status(status).json(data);

exports.fail = (res, status, message, errors) => {
  const body = { success: false, error: message, message };
  if (errors) body.errors = errors;
  return res.status(status).json(body);
};
