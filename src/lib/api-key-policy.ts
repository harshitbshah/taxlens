import { removeApiKey } from "./storage";

// HM-7: locally, forgetting a rejected key makes the UI prompt for a new one. In hosted mode the
// key comes from the container env and can't be re-entered from the browser, so forgetting it
// would leave the app unusable until a restart — and the "invalid key" signal is a substring
// match on error text, which can misfire.
export async function forgetInvalidApiKey(hosted: boolean): Promise<void> {
  if (hosted) return;
  await removeApiKey();
}
