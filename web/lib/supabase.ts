/**
 * Supabase クライアント (anon key, 読み取り専用)
 *
 * 公開ページのサーバーコンポーネントで shortId → content_hash 解決に使用。
 * RLS により published 状態のページのみ読み取れる。
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
