import express from 'express';
const app = express();
const server = app.listen(4747, "127.0.0.1", () => console.log('Listening'));
server.on('close', () => console.log('closed'));
