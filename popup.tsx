import React, { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import createMetaMaskProvider from 'metamask-extension-provider'
import { LitNodeClient } from '@lit-protocol/lit-node-client'
import { LitContracts, type TokenInfo } from '@lit-protocol/contracts-sdk'
import { LitNetwork, LIT_RPC, LIT_CHAINS, ProviderType, RELAYER_URL_BY_NETWORK } from '@lit-protocol/constants'
import { LitAuthClient, GoogleProvider } from '@lit-protocol/lit-auth-client'
import { LitAbility, LitPKPResource, LitActionResource, createSiweMessage, generateAuthSig } from '@lit-protocol/auth-helpers'
import './style.css'


let litNodeClient: LitNodeClient
let litContracts: LitContracts

function IndexPopup () {
  const [provider, setProvider] = useState<any>(null)
  const [account, setAccount] = useState<string | null>(null)
  const [signer, setSigner] = useState<ethers.Signer | null>(null)
  const [selectedNetwork, setSelectedNetwork] = useState<LitNetwork>(
    LitNetwork.DatilDev
  )
  const [pkps, setPkps] = useState<TokenInfo[]>([])
  const [selectedPkp, setSelectedPkp] = useState<TokenInfo | null>(null)
  const [balance, setBalance] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [expandedField, setExpandedField] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [selectedChain, setSelectedChain] = useState(LIT_CHAINS.yellowstone)
  const [signerBal, setSignerBal] = useState<String>(null)
  const [mintStatus, setMintStatus] = useState<'idle' | 'minting' | 'success' | 'failure'>('idle');
  const [mintResult, setMintResult] = useState<{
    tokenId: any
    publicKey: string
    ethAddress: string
  } | null>(null)
  const [isLitConnected, setIsLitConnected] = useState<boolean>(false)
  const [litActionCode, setLitActionCode] = useState<string>('');
  const [litActionParams, setLitActionParams] = useState<string>('');
  const [litActionResponse, setLitActionResponse] = useState<string>('');
  const [showLitAction, setShowLitAction] = useState<boolean>(false);
  const pkpsPerPage = 10

  const [googleProvider, setGoogleProvider] = useState(null);

  useEffect(() => {
    initProvider()
    initGoogleProvider()
  }, [])

  useEffect(() => {
    if (account && selectedChain) {
      updateBalanceForSigner()
    }
  }, [account, selectedChain])

  // Initialize te MetaMask Provider through their extension. This will set the provider to the provider variable using `setProvider`
  const initProvider = async () => {
    try {
      const newProvider = createMetaMaskProvider()
      setProvider(newProvider)
    } catch (err) {
      console.error('Failed to initialize MetaMask provider:', err)
    }
  }

  // What is th point of having two functions like this? Take a look
  const connectToMetaMask = async () => {
    if (provider) {
      try {
        const accounts = await provider.request({
          method: 'eth_requestAccounts'
        })
        const ethersProvider = new ethers.providers.Web3Provider(provider)
        const signer = ethersProvider.getSigner()
        setAccount(accounts[0])
        setSigner(signer)
        setSignerBal(
          ethers.utils.formatEther(await signer.getBalance(provider.address))
        )
      } catch (err) {
        console.error('Failed to connect to MetaMask:', err)
      }
    } else {
      console.error('MetaMask provider not initialized')
    }
  }

  // Once the user has signed in and chosen an account, connect them to the Lit network. We expect the utf-8 from the connect method of the LitNodeClient, so we catch the error
  // and set it as a warning in the console. After connecting to the Lit nodes, we connect to LitContracts, designating the signer as the metamask account an the provider as
  // a JsonRpcProvider on Yellowstone (necessary?). We then use LitContracts to read the PKPs mined to the user's account. This data includes the tokenId, ethAddress, and pkpPublicKey.
  // We then set that information to the pkpsData global variable to be displayed later.
  const connectToLitNetwork = async () => {
    if (!signer) {
      console.error('No signer available')
      return
    }
    setIsLoading(true)
    litNodeClient = new LitNodeClient({
      litNetwork: selectedNetwork,
      debug: true
    })

    await litNodeClient.connect().catch(error => {
      console.warn('Non-breaking error during connection:', error)
    })
    setIsLitConnected(true)

    litContracts = new LitContracts({
      network: selectedNetwork,
      signer,
      provider: new ethers.providers.JsonRpcProvider(
        LIT_RPC.CHRONICLE_YELLOWSTONE
      )
    })
    await litContracts.connect()
    fetchPkpData()
  }

  const fetchPkpData = async () => {
    try {
      const address = await signer.getAddress()
      const pkpsData =
        await litContracts.pkpNftContractUtils.read.getTokensInfoByAddress(
          address
        )
      setPkps(pkpsData)
    } catch (error) {
      console.error('Error during Lit Network operations:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const mintNewPkp = async () => {
    setIsLoading(true);
    setMintStatus('minting');
    setMintResult(null);
    try {
      const result = (await litContracts.pkpNftContractUtils.write.mint()).pkp;
      setMintResult(result);
      setMintStatus('success');
      await fetchPkpData();
    } catch (e) {
      console.error('Error while minting a new PKP', e);
      setMintResult({
        tokenId: 'Error while minting PKP',
        publicKey: null,
        ethAddress: null
      });
      setMintStatus('failure');
    } finally {
      setIsLoading(false);
    }
  }

  // Placeholder
  const burnPkp = async (pkp: TokenInfo) => {
    if (!signer || !litContracts || !litNodeClient) {
      console.error(
        'There was an error connecting to the Lit network! Please press the connect button'
      )
    }

    try {
      // Find and insert burn function here, probbly involves tokenId
    } catch (e) {
      console.log('Error while minting a new PKP')
    }
  }

  // When the user has their PKPs displayed in-front of them, we want to give them the option to select one of the PKPs. This function will handle the click for that, also setting
  // the selected PKP global variable, and calling the updateBalance function.
  const handlePkpClick = async (pkp: TokenInfo | { tokenId: any; publicKey: string; ethAddress: string }) => {
    const tokenInfo = {
      tokenId: pkp.tokenId.toString(),
      publicKey: pkp.publicKey,
      ethAddress: pkp.ethAddress,
      publicKeyBuffer: 'publicKeyBuffer' in pkp ? pkp.publicKeyBuffer : new Uint8Array(),
      btcAddress: 'btcAddress' in pkp ? pkp.btcAddress : '',
      cosmosAddress: 'cosmosAddress' in pkp ? pkp.cosmosAddress : '',
      isNewPKP: 'isNewPKP' in pkp ? pkp.isNewPKP : false
    } as TokenInfo;
  
    setSelectedPkp(tokenInfo);
    await updateBalance(pkp.ethAddress);
  }

  // Using the selected chain from the frontend interface, this function searches main blockchain token balance of the Ethereum address on that network, setting the balance variable.
  const updateBalance = async (address: string) => {
    setIsLoading(true)
    try {
      const chainProvider = new ethers.providers.JsonRpcProvider(
        selectedChain.rpcUrls[0]
      )
      const bal = await chainProvider.getBalance(address)
      setBalance(ethers.utils.formatEther(bal))
    } catch (error) {
      console.error('Error fetching balance:', error)
      setBalance('Error')
    } finally {
      setIsLoading(false)
    }
  }

  const updateBalanceForSigner = async () => {
    if (!account) return
    setIsLoading(true)
    try {
      const chainProvider = new ethers.providers.JsonRpcProvider(
        selectedChain.rpcUrls[0]
      )
      const bal = await chainProvider.getBalance(account)
      setSignerBal(ethers.utils.formatEther(bal))
    } catch (error) {
      console.error('Error fetching balance:', error)
      setSignerBal('Error')
    } finally {
      setIsLoading(false)
    }
  }
  // Helper funtion to expand PKP information
  const toggleExpandField = (field: string) => {
    setExpandedField(expandedField === field ? null : field)
  }

  // Helper function for copying some string of PKP information
  const CopyButton: React.FC<{ text: string }> = ({ text }) => {
    const [copied, setCopied] = useState(false)

    const handleCopy = async () => {
      try {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch (err) {
        console.error('Failed to copy text: ', err)
      }
    }

    return (
      <button onClick={handleCopy} className='copy-button'>
        {copied ? '✓' : 'Copy'}
      </button>
    )
  }

  // Helper function for rendering strings of PKP information as well as their copy buttons
  const renderExpandableField = (
    label: string,
    value: string,
    field: string
  ) => (
    <div className='expandable-field'>
      <div className='field-header'>
        <strong>{label}:</strong>
      </div>
      <div className='field-content'>
        <CopyButton text={value} />
        <p onClick={() => toggleExpandField(field)}>
          {expandedField === field ? value : `${value.slice(0, 20)}...`}
        </p>
      </div>
    </div>
  )

  
  const executeLitAction = async () => {
    if (!litNodeClient) {
      console.error('LitNodeClient not initialized');
      return;
    }
    setIsLoading(true);
    
    try {
      const sessionSignatures = await litNodeClient.getSessionSigs({
        chain: "ethereum",
        expiration: new Date(Date.now() + 1000 * 60 * 10).toISOString(),
        resourceAbilityRequests: [
          {
            resource: new LitPKPResource('*'),
            ability: LitAbility.PKPSigning,
          },
          { 
            resource: new LitActionResource('*'), 
            ability: LitAbility.LitActionExecution 
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
    } catch (e) {
      console.error('Error while executing Lit action', e);
      setLitActionResponse(`Error: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Helpers for scrolling through the PKPs
  const indexOfLastPkp = currentPage * pkpsPerPage
  const indexOfFirstPkp = indexOfLastPkp - pkpsPerPage
  const currentPkps = pkps.slice(indexOfFirstPkp, indexOfLastPkp)

  const paginate = (pageNumber: number) => setCurrentPage(pageNumber)

  // After establishing a connection, this will render the user's PKPs
  const renderPkpList = () => (
    <div className='container'>
      <h2>Lit Protocol PKP Manager</h2>
      <div>
        <button
          onClick={mintNewPkp}
          className='pkp-mint-button'
          disabled={!isLitConnected || isLoading}
        >
          {mintStatus === 'minting' ? 'Minting...' : 'Mint a new PKP'}
        </button>
        {mintStatus === 'failure' && <span className="mint-failure">Failed to Mint</span>}
        <button
          onClick={() => setShowLitAction(true)}
          className='pkp-mint-button'
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
        Connected Account: <span className='accent-text'>{account}</span>
      </p>
      <p>
        <span className='accent-text'>
          Balance: {signerBal} {selectedChain.symbol} on the{' '}
          {selectedChain.name} blockchain
        </span>
      </p>
      <label>Lit Network:</label>
      <select
        value={selectedNetwork}
        onChange={e => setSelectedNetwork(e.target.value as LitNetwork)}
      >
        {Object.values(LitNetwork).map(network => (
          <option key={network} value={network}>
            {network}
          </option>
        ))}
      </select>
      <label>Blockchain:</label>
      <select
        value={selectedChain.chainId}
        onChange={e => {
          const chain = Object.values(LIT_CHAINS).find(
            c => c.chainId === parseInt(e.target.value)
          )
          if (chain) {
            setSelectedChain(chain)
            updateBalanceForSigner()
            if (selectedPkp) {
              updateBalance(selectedPkp.ethAddress)
            }
          }
        }}
      >
        {Object.values(LIT_CHAINS).map(chain => (
          <option key={chain.chainId} value={chain.chainId}>
            {chain.name}
          </option>
        ))}
      </select>
      <button onClick={connectToLitNetwork} disabled={isLoading}>
        {isLoading ? 'Igniting Connection...' : `Connect to ${selectedNetwork}`}
      </button>
      {isLoading && (
        <div className='loading'>
          <div className='pixelated-flame'>
            {[...Array(15)].map((_, i) => (
              <div key={i} className='flame-pixel'></div>
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
              className='pkp-button'
            >
              {pkp.tokenId.slice(0, 10)}...
            </button>
          ))}
          <div className='pagination'>
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
  )

  const renderPkpDetails = () => (
    <div className='container'>
      <h2>PKP Details</h2>
      <p>
        <strong>Selected Chain:</strong> {selectedChain.name}
      </p>
      {renderExpandableField('TokenId', selectedPkp?.tokenId || '', 'tokenId')}
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
      <button onClick={() => setSelectedPkp(null)} className='back-button'>
        Back to PKP List
      </button>
    </div>
  )

  const renderLitAction = () => (
    <div className='container'>
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
      <button onClick={executeLitAction} className='execute-button' disabled={isLoading}>
        Execute Lit Action
      </button>
      <div className="response-box">
        <h3>Response:</h3>
        <pre>{litActionResponse}</pre>
      </div>
      <button onClick={() => setShowLitAction(false)} className='back-button'>
        Back to PKP List
      </button>
    </div>
  );

  const initGoogleProvider = async () => {
    try {
      const litAuthClient = new LitAuthClient({
        litRelayConfig: {
          relayUrl: RELAYER_URL_BY_NETWORK.DatilDev,
          relayApiKey: "fake-api-key"
        }
      });
      const googleProvider = litAuthClient.initProvider<GoogleProvider>(
        ProviderType.Google
      );
      setGoogleProvider(googleProvider);
      console.log("✅ googleProvider initialized!", googleProvider);
    } catch (err) {
      console.error('Failed to initialize Google provider:', err)
    }
  }

  const signInWithGoogle = async () => {
    if (googleProvider) {
      try {
        console.log("Signing in with Google...");
        await googleProvider.signIn();
        // Handle successful sign-in here
        // You might want to fetch user info or perform other actions
      } catch (err) {
        console.error('Failed to sign in with Google:', err)
      }
    } else {
      console.error('Google provider not initialized')
    }
  }

  if (!account) {
    return (
      <div className='container'>
        <h2>Lit Protocol PKP Manager</h2>
        <p>Connect your wallet to get started</p>
        <button onClick={connectToMetaMask} className='connect-metamask'>
          Connect to MetaMask
        </button>
        <button onClick={signInWithGoogle} className='connect-google'>
          Sign in with Google
        </button>
      </div>
    )
  }

  if (showLitAction) {
    return renderLitAction();
  }

  return selectedPkp ? renderPkpDetails() : renderPkpList()
}

export default IndexPopup