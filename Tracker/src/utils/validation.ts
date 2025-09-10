import * as Joi from 'joi';

// Schema for validating a single file chunk during announcement
const fileChunkSchema = Joi.object({
  fileHash: Joi.string().hex().length(64).required(),
  chunkIndex: Joi.number().integer().min(0).required(),
  size: Joi.number().integer().min(1).required(),
  fileName: Joi.string().optional(),
  fileSize: Joi.number().integer().min(1).optional(),
  checksum: Joi.string().optional(),
});

/**
 * Validates the data for peer registration.
 * As seen in server.ts, this validates address and port.
 */
export const validatePeerRegistration = (data: any) => {
  const schema = Joi.object({
    address: Joi.string().ip().required(),
    port: Joi.number().integer().min(1).max(65535).required(),
  });
  return schema.validate(data);
};

/**
 * Validates the data for announcing file chunks.
 * As seen in server.ts, this validates an object containing an array of chunks.
 */
export const validateFileChunk = (data: any) => {
  const schema = Joi.object({
    chunks: Joi.array().items(fileChunkSchema).min(1).required(),
  });
  return schema.validate(data);
};