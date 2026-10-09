// Gera valores aleatórios para as variáveis de ambiente. Cole no painel da Hostinger; não salve em arquivos do repositório.
import { randomBytes } from 'node:crypto';
const r = (n = 48) => randomBytes(n).toString('base64url');
console.log('SESSION_SECRET=' + r());
console.log('APP_KEY=' + r());
console.log('SETUP_KEY=' + r(24));
console.log('CRON_SECRET=' + r(24));
