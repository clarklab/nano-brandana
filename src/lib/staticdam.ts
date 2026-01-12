export interface SubmitOptions {
  subfolder?: string;
  tags?: string[];
  category?: string[];
}

export interface SubmitResult {
  success: boolean;
  pr_url?: string;
  error?: string;
}

export async function submitToStaticDAM(
  siteUrl: string,
  file: File,
  options?: SubmitOptions
): Promise<SubmitResult> {
  const formData = new FormData();
  formData.append('file', file);

  if (options?.subfolder) {
    formData.append('subfolder', options.subfolder);
  }
  if (options?.tags?.length) {
    formData.append('tags', JSON.stringify(options.tags));
  }
  if (options?.category?.length) {
    formData.append('category', JSON.stringify(options.category));
  }

  try {
    const res = await fetch(`${siteUrl}/api/submit-image`, {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        success: false,
        error: `HTTP ${res.status}: ${text || res.statusText}`
      };
    }

    return await res.json();
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error'
    };
  }
}
