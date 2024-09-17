import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import createMetaMaskProvider from 'metamask-extension-provider';
import { LitNodeClient } from '@lit-protocol/lit-node-client';
import { LitContracts, type TokenInfo } from '@lit-protocol/contracts-sdk';
import {
  LitNetwork,
  LIT_RPC,
  LIT_CHAINS,
  ProviderType,
  RELAYER_URL_BY_NETWORK,
} from '@lit-protocol/constants';
import { LitAuthClient, GoogleProvider } from '@lit-protocol/lit-auth-client';
import type { AuthMethod, IRelayPKP } from '@lit-protocol/types';
import {
  LitAbility,
  LitPKPResource,
  LitActionResource,
  createSiweMessage,
  generateAuthSig,
} from '@lit-protocol/auth-helpers';
import './style.css';

let litNodeClient: LitNodeClient;
let litContracts: LitContracts;
let litAuthClient: LitAuthClient;

function IndexPopup() {
  const [provider, setProvider] = useState<any>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState<LitNetwork>(
    LitNetwork.DatilDev
  );
  const [pkps, setPkps] = useState<TokenInfo[] | IRelayPKP[]>([]);
  const [selectedPkp, setSelectedPkp] = useState<TokenInfo | null>(null);
  const [selectedGooglePkp, setSelectedGooglePkp] = useState<IRelayPKP | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [expandedField, setExpandedField] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [selectedChain, setSelectedChain] = useState(LIT_CHAINS.yellowstone);
  const [signerBal, setSignerBal] = useState<string | null>(null);
  const [mintStatus, setMintStatus] = useState<
    'idle' | 'minting' | 'success' | 'failure'
  >('idle');
  const [mintResult, setMintResult] = useState<{
    tokenId: any;
    publicKey: string;
    ethAddress: string;
  } | null>(null);
  const [googleMintResult, setGoogleMintResult] = useState<IRelayPKP | null>(null);
  const [isLitConnected, setIsLitConnected] = useState<boolean>(false);
  const [litActionCode, setLitActionCode] = useState<string>('');
  const [litActionParams, setLitActionParams] = useState<string>('');
  const [litActionResponse, setLitActionResponse] = useState<string>('');
  const [showLitAction, setShowLitAction] = useState<boolean>(false);
  const [googleProvider, setGoogleProvider] = useState<GoogleProvider | null>(
    null
  );
  const [isGoogleSignedIn, setIsGoogleSignedIn] = useState<boolean>(false);
  const pkpsPerPage = 10;

  useEffect(() => {
    if (isGoogleSignedIn) {
      fetchPkpDataGoogle();
    }
  }, [isGoogleSignedIn]);

  useEffect(() => {
    initProvider();
    console.log('Popup component mounted');
  }, []);

  useEffect(() => {
    if (account && selectedChain) {
      updateBalanceForSigner();
    }
  }, [account, selectedChain]);

  // ----------------------------------------
  // Initialization and Setup Functions
  // ----------------------------------------

  const initProvider = async () => {
    try {
      const newProvider = createMetaMaskProvider();
      setProvider(newProvider);
    } catch (err) {
      console.error('Failed to initialize MetaMask provider:', err);
    }
  };

  const connectToMetaMask = async () => {
    if (provider) {
      try {
        const accounts = await provider.request({
          method: 'eth_requestAccounts',
        });
        const ethersProvider = new ethers.providers.Web3Provider(provider);
        const signer = ethersProvider.getSigner();
        setAccount(accounts[0]);
        setSigner(signer);
        setSignerBal(
          ethers.utils.formatEther(await signer.getBalance(provider.address))
        );
      } catch (err) {
        console.error('Failed to connect to MetaMask:', err);
      }
    } else {
      console.error('MetaMask provider not initialized');
    }
  };

  // ----------------------------------------
  // Authentication Functions
  // ----------------------------------------

  const signInWithGoogle = async () => {
    console.log('Initiating Google Sign-In');

    litAuthClient = new LitAuthClient({
      litRelayConfig: {
        relayUrl: RELAYER_URL_BY_NETWORK[selectedNetwork],
        relayApiKey: 'anything',
      },
      litNodeClient,
      rpcUrl: LIT_RPC.CHRONICLE_YELLOWSTONE
    });

    const extensionId = chrome.runtime.id;
    const redirectUri = `https://${extensionId}.chromiumapp.org/`;

    console.log('Redirect URI:', redirectUri);

    const googleProvider = litAuthClient.initProvider<GoogleProvider>(
      ProviderType.Google,
      {
        redirectUri: redirectUri,
      }
    );

    setGoogleProvider(googleProvider);

    console.log('Google Provider initialized');

    const existingAuth = await new Promise<{ authMethod: any } | undefined>(
      (resolve) => {
        chrome.storage.local.get('authMethod', (result) => {
          resolve(result as { authMethod: any } | undefined);
        });
      }
    );

    if (existingAuth && existingAuth.authMethod) {
      console.log('Existing authMethod found in storage');
      setIsGoogleSignedIn(true);
      chrome.runtime.sendMessage({ action: 'signInComplete', success: true });
      return;
    }

    try {
      const authResult = await new Promise<string>((resolve, reject) => {
        console.log('Calling googleProvider.signIn');
        googleProvider.signIn((url) => {
          console.log('Sign-in URL:', url);
          chrome.identity.launchWebAuthFlow(
            {
              url: url,
              interactive: true,
            },
            function (redirectUrl) {
              console.log('WebAuthFlow completed, redirectUrl:', redirectUrl);
              if (chrome.runtime.lastError) {
                console.error(
                  'Chrome runtime error:',
                  chrome.runtime.lastError
                );
                reject(chrome.runtime.lastError.message);
              } else if (redirectUrl) {
                resolve(redirectUrl);
              } else {
                reject('No redirect URL received');
              }
            }
          );
        });
      });

      console.log('Auth result:', authResult);

      const authResultUrl = new URL(authResult);
      const idToken = authResultUrl.searchParams.get('id_token');

      if (!idToken) {
        throw new Error('Missing id_token in auth result');
      }

      const authMethod = {
        accessToken: idToken,
        authMethodType: 6,
      };

      console.log('Signed in successfully', authMethod);

      const sanitizedAuthMethod = { ...authMethod, accessToken: '***' };
      console.log('Sanitized authMethod:', sanitizedAuthMethod);
      await chrome.storage.local.set({ authMethod: authMethod });
      setIsGoogleSignedIn(true);

      chrome.runtime.sendMessage({ action: 'signInComplete', success: true });
      setIsLitConnected(true);
    } catch (error) {
      console.error('Sign-in failed', error);
      chrome.runtime.sendMessage({
        action: 'signInComplete',
        success: false,
        error: (error as Error).message,
      });
    }
  };

  const fetchPkpDataGoogle = async () => {
    try {
      const result = await chrome.storage.local.get('authMethod');
      if (!result.authMethod) {
        throw new Error('No authMethod found in storage');
      }

      const authMethod: AuthMethod = {
        accessToken: result.authMethod.accessToken,
        authMethodType: result.authMethod.authMethodType,
      };
      const pkps = await googleProvider.fetchPKPsThroughRelayer(authMethod);
      setPkps(pkps);
      console.log('Pkps:', pkps);
      return pkps;
    } catch (error) {
      console.error('Error fetching PKPs:', error);
    }
  };

  const mintForGoogle = async () => {
    try {
      const result = await chrome.storage.local.get('authMethod');
      if (!result.authMethod) {
        throw new Error('No authMethod found in storage');
      }
  
      setIsLoading(true);
      setMintStatus('minting');
      setMintResult(null);
  
      const authMethod: AuthMethod = {
        accessToken: result.authMethod.accessToken,
        authMethodType: result.authMethod.authMethodType,
      };
  
      console.log(authMethod, litAuthClient);
      await litAuthClient.mintPKPWithAuthMethods([authMethod], {
        addPkpEthAddressAsPermittedAddress: true,
      });
      
      setMintStatus('success');
      const mfgPkps = await fetchPkpDataGoogle();
  
      if (mfgPkps && mfgPkps.length > 0) {
        const lastPkp = mfgPkps[mfgPkps.length - 1];
        if ('tokenId' in lastPkp && 'publicKey' in lastPkp && 'ethAddress' in lastPkp) {
          setGoogleMintResult(lastPkp);
        } else {
          console.error('Last PKP does not have expected properties', lastPkp);
          setMintStatus('failure');
        }
      } else {
        console.error('No PKPs found after minting');
        setMintStatus('failure');
      }
    } catch (e) {
      console.error('Error while minting a new PKP', e);
      setMintResult({
        tokenId: 'Error while minting PKP',
        publicKey: null,
        ethAddress: null,
      });
      setMintStatus('failure');
    } finally {
      setIsLoading(false);
    }
  };

  const renderGooglePkpDetails = () => (
    <div className="container">
      <h2>PKP Details</h2>
      <p>
        <strong>Selected Chain:</strong> {selectedChain.name}
      </p>
      {renderExpandableField(
        'TokenId',
        selectedGooglePkp?.tokenId || '',
        'tokenId'
      )}
      {renderExpandableField(
        'Public Key',
        selectedGooglePkp?.publicKey || '',
        'publicKey'
      )}
      {renderExpandableField(
        'Ethereum Address',
        selectedGooglePkp?.ethAddress || '',
        'ethAddress'
      )}
      <p>
        <strong>Balance:</strong> {balance} {selectedChain.symbol}
      </p>
      <button
        onClick={() => setSelectedGooglePkp(null)}
        className="back-button"
      >
        Back to PKP List
      </button>
    </div>
  );
  

  // ----------------------------------------
  // Lit Network Interaction Functions
  // ----------------------------------------

  const connectToLitNetwork = async () => {
    if (!signer) {
      console.error('No signer available');
      return;
    }
    setIsLoading(true);
    litNodeClient = new LitNodeClient({
      litNetwork: selectedNetwork,
      debug: true,
    });

    await litNodeClient.connect().catch((error) => {
      console.warn('Non-breaking error during connection:', error);
    });
    setIsLitConnected(true);

    litContracts = new LitContracts({
      network: selectedNetwork,
      signer,
      provider: new ethers.providers.JsonRpcProvider(
        LIT_RPC.CHRONICLE_YELLOWSTONE
      ),
    });
    await litContracts.connect();
    fetchPkpData();
  };

  const fetchPkpData = async () => {
    try {
      const address = await signer.getAddress();
      const pkpsData =
        await litContracts.pkpNftContractUtils.read.getTokensInfoByAddress(
          address
        );
      setPkps(pkpsData);
      console.log('Pkps:', pkpsData);
    } catch (error) {
      console.error('Error during Lit Network operations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const mintNewPkp = async () => {
    setIsLoading(true);
    setMintStatus('minting');
    setMintResult(null);
    try {
      const result = (await litContracts.pkpNftContractUtils.write.mint()).pkp;
      setMintResult(result);
      setMintStatus('success');
      console.log(result);
      await fetchPkpData();
    } catch (e) {
      console.error('Error while minting a new PKP', e);
      setMintResult({
        tokenId: 'Error while minting PKP',
        publicKey: null,
        ethAddress: null,
      });
      setMintStatus('failure');
    } finally {
      setIsLoading(false);
    }
  };

  const executeLitAction = async () => {
    if (!litNodeClient) {
      console.error('LitNodeClient not initialized');
      return;
    }
    setIsLoading(true);

    try {
      const sessionSignatures = await litNodeClient.getSessionSigs({
        chain: 'ethereum',
        expiration: new Date(Date.now() + 1000 * 60 * 10).toISOString(),
        resourceAbilityRequests: [
          {
            resource: new LitPKPResource('*'),
            ability: LitAbility.PKPSigning,
          },
          {
            resource: new LitActionResource('*'),
            ability: LitAbility.LitActionExecution,
          },
        ],
        authNeededCallback: async ({
          uri,
          expiration,
          resourceAbilityRequests,
        }) => {
          const toSign = await createSiweMessage({
            uri,
            expiration,
            resources: resourceAbilityRequests,
            walletAddress: await signer.getAddress(),
            nonce: await litNodeClient.getLatestBlockhash(),
            litNodeClient,
          });

          return await generateAuthSig({
            signer: signer,
            toSign,
          });
        },
      });

      let parsedParams: object;
      try {
        parsedParams = JSON.parse(litActionParams);
      } catch (e) {
        console.error('Error parsing jsParams:', e);
        setLitActionResponse('Error: Invalid jsParams JSON');
        return;
      }

      const res = await litNodeClient.executeJs({
        sessionSigs: sessionSignatures,
        jsParams: parsedParams,
        code: litActionCode,
      });

      setLitActionResponse(JSON.stringify(res, null, 2));
    } catch (e: any) {
      console.error('Error while executing Lit action', e);
      setLitActionResponse(
        `Error: ${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  // ----------------------------------------
  // PKP Management Functions
  // ----------------------------------------

  const getTokenIdString = (tokenId: any): string => {
    if (typeof tokenId === 'object') {
      if ('hex' in tokenId) {
        const decimalTokenId = BigInt(tokenId.hex).toString();
        return decimalTokenId;
      } else {
        return JSON.stringify(tokenId);
      }
    }
    return String(tokenId);
  };

  const handlePkpClick = async (
    pkp: TokenInfo | { tokenId: any; publicKey: string; ethAddress?: string }
  ) => {
    const tokenInfo = {
      tokenId: getTokenIdString(pkp.tokenId),
      publicKey: pkp.publicKey,
      ethAddress: pkp.ethAddress || '',
      publicKeyBuffer:
        'publicKeyBuffer' in pkp ? pkp.publicKeyBuffer : new Uint8Array(),
      btcAddress: 'btcAddress' in pkp ? pkp.btcAddress : '',
      cosmosAddress: 'cosmosAddress' in pkp ? pkp.cosmosAddress : '',
      isNewPKP: 'isNewPKP' in pkp ? pkp.isNewPKP : false,
    } as TokenInfo;

    setSelectedPkp(tokenInfo);
    if (tokenInfo.ethAddress) {
      await updateBalance(tokenInfo.ethAddress);
    }
  };

  const handlePkpClickGoogle = async (pkp: IRelayPKP) => {
    const tokenInfo = {
      tokenId: getTokenIdString(pkp.tokenId),
      publicKey: pkp.publicKey,
      ethAddress: pkp.ethAddress || '',
      publicKeyBuffer: new Uint8Array(),
      btcAddress: '',
      cosmosAddress: '',
      isNewPKP: false,
    } as TokenInfo;
  
    setSelectedPkp(tokenInfo);
    if (tokenInfo.ethAddress) {
      await updateBalance(tokenInfo.ethAddress);
    }
  };
  
  const updateBalance = async (address: string) => {
    if (!address) {
      setBalance('N/A');
      return;
    }
    setIsLoading(true);
    try {
      const chainProvider = new ethers.providers.JsonRpcProvider(
        selectedChain.rpcUrls[0]
      );
      const bal = await chainProvider.getBalance(address);
      setBalance(ethers.utils.formatEther(bal));
    } catch (error) {
      console.error('Error fetching balance:', error);
      setBalance('Error');
    } finally {
      setIsLoading(false);
    }
  };

  const updateBalanceForSigner = async () => {
    if (!account) return;
    setIsLoading(true);
    try {
      const chainProvider = new ethers.providers.JsonRpcProvider(
        selectedChain.rpcUrls[0]
      );
      const bal = await chainProvider.getBalance(account);
      setSignerBal(ethers.utils.formatEther(bal));
    } catch (error) {
      console.error('Error fetching balance:', error);
      setSignerBal('Error');
    } finally {
      setIsLoading(false);
    }
  };

  // ----------------------------------------
  // UI Helper Functions
  // ----------------------------------------

  const toggleExpandField = (field: string) => {
    setExpandedField(expandedField === field ? null : field);
  };

  const CopyButton: React.FC<{ text: string }> = ({ text }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy text: ', err);
      }
    };

    return (
      <button onClick={handleCopy} className="copy-button">
        {copied ? '✓' : 'Copy'}
      </button>
    );
  };

  const renderExpandableField = (
    label: string,
    value: any,
    field: string
  ) => {
    const valueStr = String(value);
    return (
      <div className="expandable-field">
        <div className="field-header">
          <strong>{label}:</strong>
        </div>
        <div className="field-content">
          <CopyButton text={valueStr} />
          <p onClick={() => toggleExpandField(field)}>
            {expandedField === field
              ? valueStr
              : `${valueStr.slice(0, 20)}...`}
          </p>
        </div>
      </div>
    );
  };

  // ----------------------------------------
  // Render Functions
  // ----------------------------------------

  const indexOfLastPkp = currentPage * pkpsPerPage;
  const indexOfFirstPkp = indexOfLastPkp - pkpsPerPage;
  const currentPkps = pkps.slice(indexOfFirstPkp, indexOfLastPkp);

  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

  const formatTokenId = (tokenId: any): string => {
    const tokenIdStr = getTokenIdString(tokenId);
    return tokenIdStr.slice(0, 10) + '...';
  };

  const renderPkpList = () => (
    <div className="container">
      <h2>Lit Protocol PKP Manager</h2>
      <div>
        <button
          onClick={mintNewPkp}
          className="pkp-mint-button"
          disabled={!isLitConnected || isLoading}
        >
          {mintStatus === 'minting' ? 'Minting...' : 'Mint a new PKP'}
        </button>
        {mintStatus === 'failure' && (
          <span className="mint-failure">Failed to Mint</span>
        )}
        <button
          onClick={() => setShowLitAction(true)}
          className="pkp-mint-button"
          disabled={!isLitConnected || isLoading}
        >
          Execute Lit Action
        </button>
        {mintResult && mintStatus === 'success' && (
          <div>
            <p>Minted!</p>
          </div>
        )}
      </div>
      <p>
        Connected Account: <span className="accent-text">{account}</span>
      </p>
      <p>
        <span className="accent-text">
          Balance: {signerBal} {selectedChain.symbol} on the{' '}
          {selectedChain.name} blockchain
        </span>
      </p>
      <label>Lit Network:</label>
      <select
        value={selectedNetwork}
        onChange={(e) => setSelectedNetwork(e.target.value as LitNetwork)}
      >
        {Object.values(LitNetwork).map((network) => (
          <option key={network} value={network}>
            {network}
          </option>
        ))}
      </select>
      <label>Blockchain:</label>
      <select
        value={selectedChain.chainId}
        onChange={(e) => {
          const chain = Object.values(LIT_CHAINS).find(
            (c) => c.chainId === parseInt(e.target.value)
          );
          if (chain) {
            setSelectedChain(chain);
            updateBalanceForSigner();
            if (selectedPkp) {
              updateBalance(selectedPkp.ethAddress);
            }
          }
        }}
      >
        {Object.values(LIT_CHAINS).map((chain) => (
          <option key={chain.chainId} value={chain.chainId}>
            {chain.name}
          </option>
        ))}
      </select>
      <button onClick={connectToLitNetwork} disabled={isLoading}>
        {isLoading
          ? 'Igniting Connection...'
          : `Connect to ${selectedNetwork}`}
      </button>
      {isLoading && (
        <div className="loading">
          <div className="pixelated-flame">
            {[...Array(15)].map((_, i) => (
              <div key={i} className="flame-pixel"></div>
            ))}
          </div>
        </div>
      )}
      {pkps.length > 0 && !isLoading && (
        <div>
          <h3>Your PKPs:</h3>
          {currentPkps.map((pkp, index) => (
            <button
              key={index}
              onClick={() => handlePkpClick(pkp)}
              className="pkp-button"
            >
              {formatTokenId(pkp.tokenId)}
            </button>
          ))}
          <div className="pagination">
            {Array.from(
              { length: Math.ceil(pkps.length / pkpsPerPage) },
              (_, i) => (
                <button
                  key={i}
                  onClick={() => paginate(i + 1)}
                  className={currentPage === i + 1 ? 'active' : ''}
                >
                  {i + 1}
                </button>
              )
            )}
          </div>
        </div>
      )}
      {pkps.length === 0 && !isLoading && isLitConnected && (
        <h3>No PKPs found</h3>
      )}
    </div>
  );

  const renderPkpDetails = () => (
    <div className="container">
      <h2>PKP Details</h2>
      <p>
        <strong>Selected Chain:</strong> {selectedChain.name}
      </p>
      {renderExpandableField(
        'TokenId',
        selectedPkp?.tokenId || '',
        'tokenId'
      )}
      {renderExpandableField(
        'Public Key',
        selectedPkp?.publicKey || '',
        'publicKey'
      )}
      {renderExpandableField(
        'Ethereum Address',
        selectedPkp?.ethAddress || '',
        'ethAddress'
      )}
      <p>
        <strong>Balance:</strong> {balance} {selectedChain.symbol}
      </p>
      <button onClick={() => setSelectedPkp(null)} className="back-button">
        Back to PKP List
      </button>
    </div>
  );

  const renderLitAction = () => (
    <div className="container">
      <h2>Execute Lit Action</h2>
      <textarea
        value={litActionCode}
        onChange={(e) => setLitActionCode(e.target.value)}
        placeholder="Enter your Lit Action code here"
        rows={10}
        className="code-input"
      />
      <textarea
        value={litActionParams}
        onChange={(e) => setLitActionParams(e.target.value)}
        placeholder="Enter your jsParams as JSON here"
        rows={5}
        className="params-input"
      />
      <button
        onClick={executeLitAction}
        className="execute-button"
        disabled={isLoading}
      >
        Execute Lit Action
      </button>
      <div className="response-box">
        <h3>Response:</h3>
        <pre>{litActionResponse}</pre>
      </div>
      <button onClick={() => setShowLitAction(false)} className="back-button">
        Back to PKP List
      </button>
    </div>
  );

  const renderGoogleUserPage = () => {
    const indexOfLastPkp = currentPage * pkpsPerPage;
    const indexOfFirstPkp = indexOfLastPkp - pkpsPerPage;
    const currentPkps = pkps.slice(indexOfFirstPkp, indexOfLastPkp);

    return (
      <div className="container">
        <h2>Lit Protocol PKP Manager</h2>
        <button onClick={mintForGoogle} className="pkp-mint-button">
          Mint a new PKP
        </button>
        { googleMintResult && (
          <>
        <button
              onClick={() => handlePkpClickGoogle(googleMintResult)}
              className="pkp-button"
            >
              {formatTokenId(googleMintResult.tokenId)}
        </button>
        <label>Lit Network:</label>
        <select
          value={selectedNetwork}
          onChange={(e) => setSelectedNetwork(e.target.value as LitNetwork)}
        >
          {Object.values(LitNetwork).map((network) => (
            <option key={network} value={network}>
              {network}
            </option>
          ))}
        </select>
        </>
        )}
        <label>Blockchain:</label>
      <select
        value={selectedChain.chainId}
        onChange={(e) => {
          const chain = Object.values(LIT_CHAINS).find(
            (c) => c.chainId === parseInt(e.target.value)
          );
          if (chain) {
            setSelectedChain(chain);
            updateBalanceForSigner();
            if (selectedPkp) {
              updateBalance(selectedPkp.ethAddress);
            }
          }
        }}
      >
        {Object.values(LIT_CHAINS).map((chain) => (
          <option key={chain.chainId} value={chain.chainId}>
            {chain.name}
          </option>
        ))}
      </select>
      <button onClick={fetchPkpDataGoogle} className="pkp-mint-button">
          Fetch PKPs</button>
        {pkps.length > 0 && !isLoading && (
          <div>
            <h3>Your PKPs:</h3>
            {currentPkps.map((pkp, index) => (
              <button
                key={index}
                onClick={() => handlePkpClick(pkp)}
                className="pkp-button"
              >
                {formatTokenId(pkp.tokenId)}
              </button>
            ))}
            <div className="pagination">
              {Array.from(
                { length: Math.ceil(pkps.length / pkpsPerPage) },
                (_, i) => (
                  <button
                    key={i}
                    onClick={() => paginate(i + 1)}
                    className={currentPage === i + 1 ? 'active' : ''}
                  >
                    {i + 1}
                  </button>
                )
              )}
            </div>
          </div>
        )}
        {pkps.length === 0 && !isLoading && isLitConnected && (
          <h3>No PKPs found</h3>
        )}
      </div>
    );
  };

  // ----------------------------------------
  // Render Logic
  // ----------------------------------------

  if (showLitAction) {
    return renderLitAction();
  } else if (selectedPkp) {
    return renderPkpDetails();
  } else if (selectedGooglePkp) {
    return renderGooglePkpDetails();
  } else if (!account && !isGoogleSignedIn) {
    return (
      <div className="container">
        <h2>Lit Protocol PKP Manager</h2>
        <p>Connect your wallet to get started</p>
        <button onClick={connectToMetaMask} className="connect-metamask">
          Connect to MetaMask
        </button>
        <button onClick={signInWithGoogle} className="connect-google">
          Sign in with Google
        </button>
      </div>
    );
  }else if (isGoogleSignedIn) {
    return renderGoogleUserPage();
  } else if (account) {
    return renderPkpList();
  }
}

export default IndexPopup;
