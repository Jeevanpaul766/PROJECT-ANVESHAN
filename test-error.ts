import express from 'express';
const app1 = express();
app1.listen(4747);
setTimeout(() => {
  const app2 = express();
  app2.listen(4747, () => console.log('App2 listening'));
}, 500);
