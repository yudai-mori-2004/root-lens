import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const headersList = await headers();
  const acceptLang = headersList.get('accept-language') || 'en';
  const primary = acceptLang.split(',')[0].split('-')[0];
  const savedLocale = cookieStore.get('NEXT_LOCALE')?.value;
  const locale = ['ja', 'en'].includes(savedLocale ?? '')
    ? savedLocale!
    : ['ja', 'en'].includes(primary)
      ? primary
      : 'en';

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
