import type { PdfDocument } from './pdfLibrary';
import { supabase, supabaseConfigured } from './supabase';

export type Account = { id: string; email: string; display_name: string };
export type RemoteStudyState = { state: Record<string, unknown> | null; revision: number; updated_at: string | null };

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message); this.name = 'ApiError'; }
}

const BUCKET = 'study-pdfs';
const MAX_PDF_BYTES = 25 * 1024 * 1024;

type PdfRow = { id: string; name: string; size: number; added_at: string };
const toDoc = (row: PdfRow): PdfDocument => ({ id: row.id, name: row.name, size: row.size, addedAt: row.added_at, cloudSynced: true });

function ensureConfigured() {
  if (!supabaseConfigured) throw new ApiError('The account service is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.', 503);
}

function fail(error: { message: string; status?: number }, fallback: string): never {
  throw new ApiError(error.message || fallback, error.status ?? 500);
}

function toAccount(user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }): Account {
  const name = user.user_metadata?.display_name;
  return { id: user.id, email: user.email ?? '', display_name: typeof name === 'string' && name.trim() ? name : 'IELTS learner' };
}

async function userId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new ApiError('Sign in to continue.', 401);
  return data.session.user.id;
}

export const api = {
  async session(): Promise<Account | null> {
    ensureConfigured();
    const { data, error } = await supabase.auth.getSession();
    if (error) fail(error, 'Could not reach your account. Please try again.');
    return data.session ? toAccount(data.session.user) : null;
  },

  async register(email: string, password: string, display_name: string): Promise<Account> {
    ensureConfigured();
    if (password.length < 12) throw new ApiError('Use a password of at least 12 characters.', 422);
    const { data, error } = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password, options: { data: { display_name: display_name.trim() || 'IELTS learner' } } });
    if (error) {
      if (/already/i.test(error.message)) throw new ApiError('An account with this email already exists. Try signing in.', 409);
      fail(error, 'Could not create your account.');
    }
    if (!data.session || !data.user) throw new ApiError('Account created. Check your email to confirm it, then sign in.', 202);
    return toAccount(data.user);
  },

  async login(email: string, password: string): Promise<Account> {
    ensureConfigured();
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) {
      if (/invalid login/i.test(error.message)) throw new ApiError('Email or password is incorrect.', 401);
      if (/not confirmed/i.test(error.message)) throw new ApiError('Confirm your email first, then sign in.', 401);
      fail(error, 'Could not sign in.');
    }
    return toAccount(data.user);
  },

  async logout(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) fail(error, 'Could not sign out.');
  },

  async getStudyState(): Promise<RemoteStudyState> {
    const { data, error } = await supabase.from('study_states').select('payload, revision, updated_at').maybeSingle();
    if (error) fail(error, 'Could not load your study plan.');
    return { state: (data?.payload as Record<string, unknown> | undefined) ?? null, revision: data?.revision ?? 0, updated_at: data?.updated_at ?? null };
  },

  async saveStudyState(state: Record<string, unknown>): Promise<RemoteStudyState> {
    const uid = await userId();
    const current = await supabase.from('study_states').select('revision').maybeSingle();
    if (current.error) fail(current.error, 'Could not save your study plan.');
    const { data, error } = await supabase
      .from('study_states')
      .upsert({ user_id: uid, payload: state, revision: (current.data?.revision ?? 0) + 1, updated_at: new Date().toISOString() })
      .select('payload, revision, updated_at')
      .single();
    if (error) fail(error, 'Could not save your study plan.');
    return { state: data.payload as Record<string, unknown>, revision: data.revision, updated_at: data.updated_at };
  },

  async uploadPdf(id: string, file: File): Promise<PdfDocument> {
    const uid = await userId();
    if (!file.name.toLowerCase().endsWith('.pdf')) throw new ApiError('Choose a PDF file.', 415);
    if (file.size === 0) throw new ApiError('This PDF is empty.', 400);
    if (file.size > MAX_PDF_BYTES) throw new ApiError('PDFs must be 25 MB or smaller.', 413);
    const header = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
    if (header !== '%PDF-') throw new ApiError('This file does not have a valid PDF header.', 415);

    const storageKey = `${id}.pdf`;
    const upload = await supabase.storage.from(BUCKET).upload(`${uid}/${storageKey}`, file, { upsert: true, contentType: 'application/pdf' });
    if (upload.error) fail(upload.error, 'Could not save this PDF. Please try again.');

    const { data, error } = await supabase
      .from('study_pdfs')
      .upsert({ user_id: uid, id, name: file.name.slice(0, 255), size: file.size, storage_key: storageKey })
      .select('id, name, size, added_at')
      .single();
    if (error) {
      await supabase.storage.from(BUCKET).remove([`${uid}/${storageKey}`]);
      fail(error, 'Could not save this PDF. Please try again.');
    }
    return toDoc(data);
  },

  async fetchPdf(id: string): Promise<File> {
    const uid = await userId();
    const row = await supabase.from('study_pdfs').select('name, storage_key').eq('id', id).maybeSingle();
    if (row.error) fail(row.error, 'Could not download this PDF from your account.');
    if (!row.data) throw new ApiError('This PDF is not in your library.', 404);
    const { data, error } = await supabase.storage.from(BUCKET).download(`${uid}/${row.data.storage_key}`);
    if (error || !data) throw new ApiError('Could not download this PDF from your account.', 404);
    return new File([data], row.data.name, { type: 'application/pdf' });
  },

  async listPdfs(): Promise<PdfDocument[]> {
    const { data, error } = await supabase.from('study_pdfs').select('id, name, size, added_at').order('added_at', { ascending: false });
    if (error) fail(error, 'Could not load your PDF library.');
    return (data ?? []).map(toDoc);
  },

  async deletePdf(id: string): Promise<void> {
    const uid = await userId();
    const row = await supabase.from('study_pdfs').select('storage_key').eq('id', id).maybeSingle();
    if (row.error) fail(row.error, 'Could not remove this PDF.');
    if (!row.data) return;
    const removed = await supabase.storage.from(BUCKET).remove([`${uid}/${row.data.storage_key}`]);
    if (removed.error) fail(removed.error, 'Could not remove this PDF.');
    const { error } = await supabase.from('study_pdfs').delete().eq('id', id);
    if (error) fail(error, 'Could not remove this PDF.');
  },
};
