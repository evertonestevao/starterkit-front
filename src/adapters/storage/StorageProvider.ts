/**
 * Interface única de armazenamento de arquivos (mesmo padrão de
 * PaymentGateway/EmailProvider): services nunca chamam o storage do provedor
 * direto. Trocar de provedor (S3, R2...) = implementar esta interface.
 */

export interface StorageUploadParams {
  /** Path dentro do bucket, ex.: "<user_id>/avatar.png". */
  path: string;
  content: Blob | ArrayBuffer | Uint8Array;
  contentType: string;
  /** true = sobrescreve se já existir (default false). */
  upsert?: boolean;
}

export interface StorageProvider {
  readonly name: string;
  /** Sobe o arquivo e devolve o path final. Lança AppError em falha. */
  upload(params: StorageUploadParams): Promise<{ path: string }>;
  remove(path: string): Promise<void>;
  /** Conteúdo do arquivo, ou null se não existir. Para buckets privados, lidos pelo servidor. */
  download(path: string): Promise<Uint8Array | null>;
  /** Move dentro do mesmo bucket (usado ao publicar o que foi aprovado). */
  move(from: string, to: string): Promise<void>;
  /** URL pública do arquivo (buckets públicos). Função pura, sem I/O. */
  getPublicUrl(path: string): string;
}
