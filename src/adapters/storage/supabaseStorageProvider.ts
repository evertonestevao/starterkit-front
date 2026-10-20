import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { StorageProvider, StorageUploadParams } from "./StorageProvider";

/**
 * Implementação Supabase Storage. Recebe o client vinculado à sessão do
 * usuário: as policies do bucket (migration 20260706110000) garantem que
 * cada usuário só escreve na própria pasta — mesmo racional da RLS de dados.
 */
export function createSupabaseStorageProvider(client: SupabaseClient, bucket: string): StorageProvider {
  return {
    name: "supabase",

    async upload({ path, content, contentType, upsert = false }: StorageUploadParams) {
      const { data, error } = await client.storage.from(bucket).upload(path, content, {
        contentType,
        upsert,
      });
      if (error || !data) {
        throw new AppError("internal_error", "Falha ao enviar arquivo", error);
      }
      return { path: data.path };
    },

    async move(from: string, to: string) {
      const { error } = await client.storage.from(bucket).move(from, to);
      if (error) {
        throw new AppError("internal_error", "Falha ao publicar arquivo", error);
      }
    },

    async remove(path: string) {
      const { error } = await client.storage.from(bucket).remove([path]);
      if (error) {
        throw new AppError("internal_error", "Falha ao remover arquivo", error);
      }
    },

    async download(path: string) {
      const { data, error } = await client.storage.from(bucket).download(path);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },

    getPublicUrl(path: string) {
      return client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    },
  };
}
