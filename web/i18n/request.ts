import { getRequestConfig } from 'next-intl/server';
import { headers } from 'next/headers';

export default getRequestConfig(async () => {
  const headersList = await headers();
  const acceptLang = headersList.get('accept-language') || 'en';
  const primary = acceptLang.split(',')[0].split('-')[0];
  const locale = ['ja', 'en'].includes(primary) ? primary : 'en';

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
