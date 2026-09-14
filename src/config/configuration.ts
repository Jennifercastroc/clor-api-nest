export interface AppConfig {
  port: number;
  azureOpenAI: {
    endpoint: string;
    apiKey: string;
    deploymentName: string;
  };
  supabase: {
    url?: string;
    anonKey?: string;
    serviceRoleKey?: string;
  };
}

export default (): AppConfig => {
  const requiredAzureVars = [
    'AZURE_OPENAI_ENDPOINT',
    'AZURE_OPENAI_API_KEY',
    'AZURE_OPENAI_DEPLOYMENT_NAME',
  ];
  const missingAzureVars = requiredAzureVars.filter((key) => !process.env[key]);
  if (missingAzureVars.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missingAzureVars.join(', ')}. ` +
        'Check your .env file against .env.example.',
    );
  }

  const supabaseVars = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missingSupabaseVars = supabaseVars.filter((key) => !process.env[key]);
  if (missingSupabaseVars.length > 0) {
    console.warn(
      `[config] Missing Supabase environment variable(s): ${missingSupabaseVars.join(', ')}. ` +
        'Supabase-dependent features will not work until these are set.',
    );
  }

  return {
    port: parseInt(process.env.PORT ?? '3000', 10),
    azureOpenAI: {
      endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
      apiKey: process.env.AZURE_OPENAI_API_KEY!,
      deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME!,
    },
    supabase: {
      url: process.env.SUPABASE_URL,
      anonKey: process.env.SUPABASE_ANON_KEY,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
  };
};
