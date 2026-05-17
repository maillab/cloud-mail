import { Hono } from 'hono';
const app = new Hono();

import result from '../model/result';
import { cors } from 'hono/cors';

app.use('*', cors());

app.onError((err, c) => {
	if (err.name === 'BizError') {
		console.log(err.message);
	} else {
		console.error(err);
	}

	if (
		err.message === `Cannot read properties of undefined (reading 'get')` ||
		err.message === `Cannot read properties of null (reading 'get')` ||
		err.message === `c.env.kv.get is not a function` ||
		(err.message && err.message.includes('kv') && err.message.includes('not a function'))
	) {
		return c.json(result.fail('KV database not bound', 502));
	}

	if (
		err.message === `Cannot read properties of undefined (reading 'put')` ||
		err.message === `Cannot read properties of null (reading 'put')` ||
		err.message === `c.env.kv.put is not a function` ||
		(err.message && err.message.includes('kv') && err.message.includes('not a function'))
	) {
		return c.json(result.fail('KV database not bound', 502));
	}

	if (
		err.message === `Cannot read properties of undefined (reading 'prepare')` ||
		err.message === `Cannot read properties of null (reading 'prepare')` ||
		(err.message && err.message.includes('db') && err.message.includes('not a function'))
	) {
		return c.json(result.fail('D1 database not bound', 502));
	}

	return c.json(result.fail(err.message, err.code));
});

export default app;


