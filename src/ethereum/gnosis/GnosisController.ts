import {BigNumber, ethers} from 'ethers';
import Safe, { EthersAdapter } from '@gnosis.pm/safe-core-sdk';
import {Address, isWeb3Failure, ProviderBundle} from "../Web3Types";
import {Dispatch} from "@reduxjs/toolkit";
import {ERC721Token} from "../contracts/base/ERC721";
import {OniRoninContract} from "../contracts/OniRoninContract";
import {setGnosisData} from "../../redux/GnosisSlice";
import {isError} from "../../utils/Utils";
import {OniRonin} from "../contracts/ContractTypes";
import {GhostbustersPuftContract} from "../contracts/GhostbustersPuftContract";

// DOCUMENTATION
// https://www.npmjs.com/package/@gnosis.pm/safe-core-sdk

const GNOSIS_SAFE_ADDRESS = '0x1715f37113C56d7361b1191AEE2B45DA020a85E9';

class GnosisController {

    private _gnosisAdapter?: EthersAdapter = undefined;

    constructor(private readonly provider: ethers.providers.Web3Provider) { }

    public async getSafeValue(): Promise<BigNumber> {
        const safe = await this.getSafe();
        return await safe.getBalance();
    }

    public async getOwnerAddresses(): Promise<Address[]> {
        const safe = await this.getSafe();
        return await safe.getOwners();
    }

    public async getModules(): Promise<string[]> {
        const safe = await this.getSafe();
        return await safe.getModules();
    }

    public async isOwner(address: string): Promise<boolean> {
        const safe = await this.getSafe();
        return await safe.isOwner(address);
    }

    public async getThreshold(): Promise<number> {
        const safe = await this.getSafe();

        return await safe.getThreshold()
    }

    private async __testGround_DO_NOT_USE() {
        const safe = await this.getSafe();

        await safe.getThreshold()
    }

    private async getSafe(): Promise<Safe> {
        if (this._gnosisAdapter === undefined) {
            const signer = this.provider.getSigner();
            this._gnosisAdapter = new EthersAdapter({
                ethers,
                signer,
            });
        }
        return await Safe.create({ethAdapter: this._gnosisAdapter, safeAddress: GNOSIS_SAFE_ADDRESS});
    }
}

export async function loadGnosisData(bundle: ProviderBundle, dispatch: Dispatch) {
    if (isWeb3Failure(bundle)) {
        dispatch(setGnosisData({state: "Error", message: bundle.reason}));
        return;
    }

    dispatch(setGnosisData({state: "Loading"}));

    const {provider} = bundle;
    try {
        const gnosisController = new GnosisController(provider);

        // Load ETH balance
        const balance = await gnosisController.getSafeValue();

        // Load owners
        const ownerAddresses = await gnosisController.getOwnerAddresses();

        // See if owners have an ENS name
        const owners = await Promise.all(ownerAddresses.map(async address => {
            const name = await provider.lookupAddress(address);
            return { address, name };
        }));

        const threshold = await gnosisController.getThreshold();


        let oniTokens: ERC721Token<OniRonin>[] = [];
        let puftTokenIds: number[] = [];
        try {
            const oniRoninContract = new OniRoninContract(provider);
            const tokenIds = await oniRoninContract.ERC721.getAllTokenIdsOwnedByAddress(GNOSIS_SAFE_ADDRESS);
            oniTokens = await Promise.all(tokenIds.map(async (tokenId) => {
                return await oniRoninContract.ERC721.fullyResolveURI(tokenId);
            }));

            const puftContract = new GhostbustersPuftContract(provider);
            puftTokenIds = await puftContract.tokenOwner(GNOSIS_SAFE_ADDRESS);
            /*
            puftTokens = await Promise.all(puftTokenIds.map(async tokenId => {
                return await puftContract.ERC721.fullyResolveURI(tokenId);
            }));
            */
        } catch (err) {
            console.error(err);
        }

        dispatch(setGnosisData({
            state: "Loaded",
            gnosisData: {
                balance: balance.toString(),
                owners,
                threshold,
                oniTokens,
                puftTokenIds,
            }
        }));
    } catch (err) {
        console.error(err);
        if (isError(err)) {
            dispatch(setGnosisData({state: "Error", message: err.message}));
        } else {
            dispatch(setGnosisData({state: "Error", message: "Unknown error"}));
        }
    }
}
