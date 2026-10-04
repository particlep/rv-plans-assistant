export interface Env {
  ASSETS: Fetcher;
  CHATS: KVNamespace;
  ANTHROPIC_API_KEY: string;
  ANTHROPIC_WORKSPACE_ID?: string; // needed when the key is not workspace-scoped
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  DEV_BYPASS_AUTH?: string;
}
