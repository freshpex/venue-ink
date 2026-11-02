import { createPool } from '../server/db.mjs';
import bcrypt from 'bcryptjs';
const pool=createPool();
try{const user=(await pool.query('SELECT id,email,password_hash,role FROM venue_app.users WHERE email=$1',[process.env.SEED_ADMIN_EMAIL])).rows[0];const counts=(await pool.query("SELECT (SELECT count(*) FROM venue_app.services)::integer AS services,(SELECT count(*) FROM venue_app.articles)::integer AS articles,(SELECT count(*) FROM venue_app.availability)::integer AS availability_rules")).rows[0];console.log(JSON.stringify({adminExists:!!user,role:user?.role,passwordVerified:user?await bcrypt.compare(process.env.SEED_ADMIN_PASSWORD,user.password_hash):false,...counts}));}finally{await pool.end();}
