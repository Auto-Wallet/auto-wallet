import * as keyManager from '../lib/key-manager';
import * as networkManager from '../lib/network-manager';
import * as whitelist from '../lib/whitelist';
import * as tokenManager from '../lib/token-manager';
import * as txLogger from '../lib/tx-logger';
import { getClient } from '../lib/network-manager';
import { getItem, setItem, STORAGE_KEYS } from '../lib/storage';
import { formatEther, parseEther, parseUnits, createWalletClient, http, encodeFunctionData, erc20Abi } from 'viem';
import { genId } from '../types/messages';
import type { WhitelistRule } from '../types/whitelist';
import type { Network } from '../types/network';
import { type WalletSettings, DEFAULT_SETTINGS } from '../types/settings';
import { emitAccountsChanged, emitChainChanged } from './events';
import { toHex } from 'viem';

/** Handle actions from the Popup UI. */
export async function handlePopupAction(action: string, payload: any): Promise<unknown> {
  switch (action) {
    // --- Wallet ---
    case 'hasWallet':
      return keyManager.hasWallet();
    case 'isUnlocked':
      return keyManager.isUnlocked();
    case 'createWallet':
      return keyManager.createWallet(payload.password, payload.label);
    case 'importPrivateKey':
      return keyManager.importPrivateKey(payload.privateKey, payload.password, payload.label);
    case 'importMnemonic':
      return keyManager.importMnemonic(payload.mnemonic, payload.password, payload.label);
    case 'unlock':
      return keyManager.unlock(payload.password);
    case 'lock':
      await keyManager.lock();
      emitAccountsChanged([]);
      return true;
    case 'getAddress':
      return await keyManager.getAddress();

    // --- Multi-account ---
    case 'listAccounts':
      return keyManager.listAccounts();
    case 'switchAccount': {
      const newAddr = await keyManager.switchAccount(payload.accountId);
      emitAccountsChanged([newAddr]);
      return newAddr;
    }
    case 'renameAccount':
      return keyManager.renameAccount(payload.accountId, payload.label);
    case 'removeAccount': {
      await keyManager.removeAccount(payload.accountId);
      const addr = await keyManager.getAddress();
      emitAccountsChanged([addr]);
      return true;
    }
    case 'getActiveAccountId':
      return await keyManager.getActiveAccountId();
    case 'deleteWallet':
      return keyManager.deleteWallet();
    case 'exportPrivateKey':
      return keyManager.exportPrivateKey(payload.accountId, payload.password);

    // --- Add account (reuses master password) ---
    case 'addAccountGenerate': {
      const addr = await keyManager.addAccountGenerate(payload.label);
      emitAccountsChanged([addr]);
      return addr;
    }
    case 'addAccountPrivateKey': {
      const addr = await keyManager.addAccountPrivateKey(payload.privateKey, payload.label);
      emitAccountsChanged([addr]);
      return addr;
    }
    case 'addAccountMnemonic': {
      const addr = await keyManager.addAccountMnemonic(payload.mnemonic, payload.label);
      emitAccountsChanged([addr]);
      return addr;
    }

    // --- Balance ---
    case 'getNativeBalance': {
      const address = await keyManager.getAddress();
      const client = await getClient();
      const balance = await client.getBalance({ address: address as `0x${string}` });
      return formatEther(balance);
    }

    // --- Send native token ---
    case 'sendNative': {
      const account = await keyManager.getAccount();
      const network = await networkManager.getActiveNetwork();
      const client = createWalletClient({
        account,
        transport: http(network.rpcUrl),
      });
      const value = parseEther(payload.amount);
      const chain = {
        id: network.chainId,
        name: network.name,
        nativeCurrency: { name: network.symbol, symbol: network.symbol, decimals: network.decimals },
        rpcUrls: { default: { http: [network.rpcUrl] } },
      };
      const hash = await client.sendTransaction({
        to: payload.to as `0x${string}`,
        value,
        chain,
      });
      await txLogger.appendLog({
        id: genId(),
        timestamp: Date.now(),
        chainId: network.chainId,
        from: account.address,
        to: payload.to,
        value: String(value),
        hash,
        origin: 'Auto Wallet',
        autoSigned: true,
        status: 'pending',
      });
      return hash;
    }

    // --- Send ERC-20 token ---
    case 'sendToken': {
      const account = await keyManager.getAccount();
      const network = await networkManager.getActiveNetwork();
      const client = createWalletClient({
        account,
        transport: http(network.rpcUrl),
      });
      const amount = parseUnits(payload.amount, payload.decimals);
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [payload.to as `0x${string}`, amount],
      });
      const chain = {
        id: network.chainId,
        name: network.name,
        nativeCurrency: { name: network.symbol, symbol: network.symbol, decimals: network.decimals },
        rpcUrls: { default: { http: [network.rpcUrl] } },
      };
      const hash = await client.sendTransaction({
        to: payload.tokenAddress as `0x${string}`,
        data,
        value: 0n,
        chain,
      });
      await txLogger.appendLog({
        id: genId(),
        timestamp: Date.now(),
        chainId: network.chainId,
        from: account.address,
        to: payload.to,
        value: String(amount),
        hash,
        method: data.slice(0, 10),
        origin: 'Auto Wallet',
        autoSigned: true,
        status: 'pending',
      });
      return hash;
    }

    // --- Networks ---
    case 'getNetworks':
      return networkManager.getAllNetworks();
    case 'getActiveNetwork':
      return networkManager.getActiveNetwork();
    case 'switchNetwork': {
      const net = await networkManager.switchNetwork(payload.chainId);
      emitChainChanged(toHex(net.chainId));
      return net;
    }
    case 'addCustomNetwork':
      return networkManager.addCustomNetwork(payload as Network);
    case 'removeCustomNetwork':
      return networkManager.removeCustomNetwork(payload.chainId);

    // --- Whitelist ---
    case 'getRules':
      return whitelist.getRules();
    case 'addRule':
      return whitelist.addRule(payload as WhitelistRule);
    case 'updateRule':
      return whitelist.updateRule(payload.id, payload.patch);
    case 'removeRule':
      return whitelist.removeRule(payload.id);

    // --- Tokens ---
    case 'getTokens':
      return tokenManager.getTokens();
    case 'addToken':
      return tokenManager.addToken(payload.chainId, payload.address);
    case 'removeToken':
      return tokenManager.removeToken(payload.chainId, payload.address);
    case 'getTokenBalance':
      return tokenManager.getTokenBalance(payload.token, await keyManager.getAddress());

    // --- Tx Log ---
    case 'getTxLog':
      return txLogger.getLog();
    case 'clearTxLog':
      return txLogger.clearLog();

    // --- Settings ---
    case 'getSettings': {
      const s = await getItem<WalletSettings>(STORAGE_KEYS.SETTINGS);
      return { ...DEFAULT_SETTINGS, ...s };
    }
    case 'saveSettings': {
      const current = await getItem<WalletSettings>(STORAGE_KEYS.SETTINGS);
      const merged = { ...DEFAULT_SETTINGS, ...current, ...payload };
      await setItem(STORAGE_KEYS.SETTINGS, merged);
      return merged;
    }

    default:
      throw new Error(`Unknown popup action: ${action}`);
  }
}
