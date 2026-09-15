import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const headersList = await headers();
  const acceptLang = headersList.get('accept-language') || 'ja';
  const primary = acceptLang.split(',')[0].split('-')[0];
  const savedLocale = cookieStore.get('NEXT_LOCALE')?.value;
  const locale = ['ja', 'en'].includes(savedLocale ?? '')
    ? savedLocale!
    : ['ja', 'en'].includes(primary)
      ? primary
      // 検索クローラなど言語を特定できないリクエストには、国内向けの
      // 既定コンテンツを返す。英語圏のブラウザは Accept-Language で en を選ぶ。
      : 'ja';

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
