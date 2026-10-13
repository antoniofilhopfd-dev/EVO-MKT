import { appendFile } from 'node:fs/promises';
import { createTransport, type Transporter } from 'nodemailer';
import { env, envInt } from './util';

let transport: Transporter | null = null;

/** Envio melhor-esforço. Sem SMTP configurado só registra no console (ou em MAIL_LOG nos testes). */
export async function notifyMail(assunto: string, texto: string, to?: string): Promise<void> {
  const dest = to ?? env('NOTIFY_TO');
  if (!dest) return;
  try {
    const log = env('MAIL_LOG');
    if (log) {
      await appendFile(log, JSON.stringify({ to: dest, assunto, texto }) + '\n');
      return;
    }
    if (!env('SMTP_HOST')) {
      console.log(`[mail] (sem SMTP) para ${dest}: ${assunto}`);
      return;
    }
    transport ??= createTransport({
      host: env('SMTP_HOST'),
      port: envInt('SMTP_PORT', 465),
      secure: envInt('SMTP_PORT', 465) === 465,
      auth: env('SMTP_USER') ? { user: env('SMTP_USER'), pass: env('SMTP_PASSWORD') } : undefined,
    });
    await transport.sendMail({ from: `EVO MKT <${env('MAIL_FROM', env('SMTP_USER'))}>`, to: dest, subject: `[EVO MKT] ${assunto}`, text: texto });
  } catch (e: any) {
    console.error('[mail] falhou:', e?.message);
  }
}
