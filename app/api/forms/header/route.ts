import { FORM_HEADER_PNG_BASE64 } from '@/lib/form-header';

// The Elimu+ banner for the top of every Google Form. Public on purpose: the forms script fetches it with no secret, and it is only an image.
export function GET() {
  return new Response(Buffer.from(FORM_HEADER_PNG_BASE64, 'base64'), {
    headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' },
  });
}
