import { drizzle } from 'drizzle-orm/d1';
import type { DatabaseContext } from '../types/context';

export default function orm(c: DatabaseContext) {
	return drizzle(c.env.db,{logger: c.env.orm_log})
}
