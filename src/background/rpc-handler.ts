import {
  createWalletClient,
  http,
  toHex,
  hexToBigInt,
} from 'viem';
import * as keyManager from '../lib/key-manager';
import * as networkManager from '../lib/network-manager';
import * as whitelist from '../lib/whitelist';
import * as txLogger from '../lib/tx-logger';
import * as tokenManager from '../lib/token-manager';
import { genId } from '../types/messages';
import { requestUserConfirmation } from './confirm-manager';

// --- RPC Method Router ---

export async function handleRpcMethod(
  method: string,
  params: unknown[],
  origin: string,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  switch (method) {
    // --- Account methods ---
    case 'eth_requestAccounts':
    case 'eth_accounts':
      return handleAccounts();

    // --- Chain methods ---
    case 'eth_chainId':
      return toHex(networkManager.getActiveChainId());

    case 'net_version':
      return String(networkManager.getActiveChainId());

    case 'wallet_switchEthereumChain':
      return handleSwitchChain(params);

    case 'wallet_addEthereumChain':
      return handleAddChain(params);

    // --- Signing ---
    case 'eth_sendTransaction':
      return handleSendTransaction(params, origin);

    case 'personal_sign':
      return handlePersonalSign(params, origin);

    case 'eth_sign':
      return handlePersonalSign(params, origin);

    case 'eth_signTypedData_v4':
    case 'eth_signTypedData':
      return handleSignTypedData(params, origin);

    // --- Token ---
    case 'wallet_watchAsset':
      return handleWatchAsset(params);

    // --- Read-only RPC: forward to node ---
    default:
      return forwardToNode(method, params);
  }
}

// --- Handlers ---

function handleAccounts(): string[] {
  if (!keyManager.isUnlocked()) return [];
  return [keyManager.getAddress()];
}

async function handleSwitchChain(params: unknown[]): Promise<null> {
  const { chainId } = params[0] as { chainId: string };
  const id = parseInt(chainId, 16);
  await networkManager.switchNetwork(id);
  return null;
}

async function handleAddChain(params: unknown[]): Promise<null> {
  const p = params[0] as {
    chainId: string;
    chainName: string;
    rpcUrls: string[];
    nativeCurrency: { name: string; symbol: string; decimals: number };
    blockExplorerUrls?: string[];
  };
  const chainId = parseInt(p.chainId, 16);

  // If chain already exists, just switch to it
  const all = await networkManager.getAllNetworks();
  if (all.find((n) => n.chainId === chainId)) {
    await networkManager.switchNetwork(chainId);
    return null;
  }

  await networkManager.addCustomNetwork({
    chainId,
    name: p.chainName,
    rpcUrl: p.rpcUrls[0],
    symbol: p.nativeCurrency.symbol,
    decimals: p.nativeCurrency.decimals,
    blockExplorerUrl: p.blockExplorerUrls?.[0],
    isCustom: true,
  });
  await networkManager.switchNetwork(chainId);
  return null;
}

async function handleSendTransaction(params: unknown[], origin: string): Promise<string> {
  const account = keyManager.getAccount();
  const tx = params[0] as Record<string, string>;
  const network = await networkManager.getActiveNetwork();
  const chainId = network.chainId;

  const value = tx.value ?? '0x0';
  const gasLimit = tx.gas ?? tx.gasLimit ?? null;

  // Check auto-sign whitelist
  const autoSignResult = await whitelist.checkAutoSign({
    origin,
    to: tx.to ?? null,
    data: tx.data ?? null,
    value: String(hexToBigInt(value as `0x${string}`)),
    gasLimit: gasLimit ? String(hexToBigInt(gasLimit as `0x${string}`)) : null,
    chainId,
  });

  // If not auto-signed, require manual confirmation via popup
  if (!autoSignResult.allowed) {
    const approved = await requestUserConfirmation({
      id: genId(),
      method: 'eth_sendTransaction',
      origin,
      params: [tx],
    });
    if (!approved) {
      const err = new Error('User rejected the transaction');
      (err as any).code = 4001;
      throw err;
    }
  }

  // Build and send transaction
  const client = createWalletClient({
    account,
    transport: http(network.rpcUrl),
  });

  const hash = await client.sendTransaction({
    to: tx.to as `0x${string}`,
    value: hexToBigInt(value as `0x${string}`),
    data: (tx.data as `0x${string}`) ?? undefined,
    gas: gasLimit ? hexToBigInt(gasLimit as `0x${string}`) : undefined,
    chain: { id: chainId, name: network.name, nativeCurrency: { name: network.symbol, symbol: network.symbol, decimals: network.decimals }, rpcUrls: { default: { http: [network.rpcUrl] } } },
  });

  // Log the transaction
  await txLogger.appendLog({
    id: genId(),
    timestamp: Date.now(),
    chainId,
    from: account.address,
    to: tx.to ?? '',
    value: String(hexToBigInt(value as `0x${string}`)),
    hash,
    method: tx.data?.slice(0, 10) ?? undefined,
    origin,
    autoSigned: autoSignResult.allowed,
    ruleId: autoSignResult.rule?.id,
    status: 'pending',
  });

  return hash;
}

async function handlePersonalSign(params: unknown[], origin: string): Promise<string> {
  const account = keyManager.getAccount();

  // Always require confirmation for message signing
  const approved = await requestUserConfirmation({
    id: genId(),
    method: 'personal_sign',
    origin,
    params,
  });
  if (!approved) {
    const err = new Error('User rejected the request');
    (err as any).code = 4001;
    throw err;
  }

  // personal_sign: params[0] = message, params[1] = address
  const message = params[0] as string;
  return account.signMessage({ message: { raw: message as `0x${string}` } });
}

async function handleSignTypedData(params: unknown[], origin: string): Promise<string> {
  const account = keyManager.getAccount();

  // Always require confirmation for typed data signing
  const approved = await requestUserConfirmation({
    id: genId(),
    method: 'eth_signTypedData_v4',
    origin,
    params,
  });
  if (!approved) {
    const err = new Error('User rejected the request');
    (err as any).code = 4001;
    throw err;
  }

  const typedData = typeof params[1] === 'string' ? JSON.parse(params[1]) : params[1];
  return account.signTypedData(typedData);
}

async function handleWatchAsset(params: unknown[]): Promise<boolean> {
  const p = params[0] as { type: string; options: { address: string; symbol?: string; decimals?: number } };
  if (p.type !== 'ERC20') throw new Error('Only ERC20 tokens are supported');
  const network = await networkManager.getActiveNetwork();
  await tokenManager.addToken(network.chainId, p.options.address);
  return true;
}

async function forwardToNode(method: string, params: unknown[]): Promise<unknown> {
  const network = await networkManager.getActiveNetwork();
  const response = await fetch(network.rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await response.json();
  if (json.error) throw json.error;
  return json.result;
}
