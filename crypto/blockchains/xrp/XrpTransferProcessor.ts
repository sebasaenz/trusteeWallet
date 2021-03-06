/**
 * @version 0.20
 * https://gist.github.com/WietseWind/19df307c3c68748543971242284ade4d
 *
 * https://xrpl.org/rippleapi-reference.html#preparepayment
 * https://xrpl.org/rippleapi-reference.html#sign
 * https://xrpl.org/rippleapi-reference.html#submit
 */
import BlocksoftCryptoLog from '../../common/BlocksoftCryptoLog'
import BlocksoftUtils from '../../common/BlocksoftUtils'
import BlocksoftDispatcher from '../BlocksoftDispatcher'
import MarketingEvent from '../../../app/services/Marketing/MarketingEvent'

import { BlocksoftBlockchainTypes } from '../BlocksoftBlockchainTypes'
import { XrpTxSendProvider } from './basic/XrpTxSendProvider'


const FEE_DECIMALS = 6

export default class XrpTransferProcessor implements BlocksoftBlockchainTypes.TransferProcessor {
    private _settings: { network: string; currencyCode: string }
    private _provider: XrpTxSendProvider

    constructor(settings: { network: string; currencyCode: string }) {
        this._settings = settings
        this._provider = new XrpTxSendProvider()
    }

    needPrivateForFee(): boolean {
        return false
    }

    checkSendAllModal(data: { currencyCode: any }): boolean {
        return false
    }

    async checkTransferHasError(data: BlocksoftBlockchainTypes.CheckTransferHasErrorData): Promise<BlocksoftBlockchainTypes.CheckTransferHasErrorResult> {
        // @ts-ignore
        if (data.amount && data.amount * 1 > 20) {
            return { isOk: true }
        }
        /**
         * @type {XrpScannerProcessor}
         */
        const balanceProvider = BlocksoftDispatcher.getScannerProcessor(this._settings.currencyCode)
        const balanceRaw = await balanceProvider.getBalanceBlockchain(data.addressTo)
        if (balanceRaw && typeof balanceRaw.balance !== 'undefined' && balanceRaw.balance > 20) {
            return { isOk: true }
        } else {
            return { isOk: false, code: 'XRP', address: data.addressTo }
        }
    }

    async getFeeRate(data: BlocksoftBlockchainTypes.TransferData, privateData: BlocksoftBlockchainTypes.TransferPrivateData, additionalData: {} = {}): Promise<BlocksoftBlockchainTypes.FeeRateResult> {
        const result: BlocksoftBlockchainTypes.FeeRateResult = {
            selectedFeeIndex: -1
        } as BlocksoftBlockchainTypes.FeeRateResult

        // @ts-ignore
        if (data.amount * 1 <= 0) {
            BlocksoftCryptoLog.log(this._settings.currencyCode + ' XrpTransferProcessor.getFeeRate ' + data.addressFrom + ' => ' + data.addressTo + ' skipped as zero amount')
            return result
        }

        BlocksoftCryptoLog.log(this._settings.currencyCode + ' XrpTransferProcessor.getFeeRate ' + data.addressFrom + ' => ' + data.addressTo + ' started amount: ' + data.amount)

        const txJson = await this._provider.getPrepared(data)
        if (!txJson) {
            throw new Error('SERVER_RESPONSE_BAD_INTERNET')
        }
        // @ts-ignore
        const fee = BlocksoftUtils.toUnified(txJson.Fee, FEE_DECIMALS)

        BlocksoftCryptoLog.log(this._settings.currencyCode + ' XrpTransferProcessor.getFeeRate ' + data.addressFrom + ' => ' + data.addressTo + ' finished amount: ' + data.amount + ' fee: ' + fee)
        result.fees = [
            {
                langMsg: 'xrp_speed_one',
                feeForTx: fee,
                amountForTx: data.amount,
                blockchainData: txJson
            }
        ]
        result.selectedFeeIndex = 0
        return result
    }

    async getTransferAllBalance(data: BlocksoftBlockchainTypes.TransferData, privateData: BlocksoftBlockchainTypes.TransferPrivateData, additionalData: { estimatedGas?: number, gasPrice?: number[], balance?: string } = {}): Promise<BlocksoftBlockchainTypes.TransferAllBalanceResult> {
        const balance = data.amount

        // @ts-ignore
        BlocksoftCryptoLog.log(this._settings.currencyCode + ' XrpTransferProcessor.getTransferAllBalance ', data.addressFrom + ' => ' + balance)
        // noinspection EqualityComparisonWithCoercionJS
        if (BlocksoftUtils.diff(balance, 20) <= 0) {
            return {
                selectedTransferAllBalance: '0',
                selectedFeeIndex: -1,
                fees: [],
                countedForBasicBalance: '0'
            }
        }


        const result = await this.getFeeRate(data, privateData, additionalData)
        // @ts-ignore
        if (!result || result.selectedFeeIndex < 0) {
            return {
                selectedTransferAllBalance: '0',
                selectedFeeIndex: -2,
                fees: [],
                countedForBasicBalance: balance
            }
        }
        // @ts-ignore
        result.fees[result.selectedFeeIndex].amountForTx = BlocksoftUtils.diff(result.fees[result.selectedFeeIndex].amountForTx, 20).toString()
        return {
            ...result,
            selectedTransferAllBalance: result.fees[result.selectedFeeIndex].amountForTx,
            shouldChangeBalance: true
        }
    }

    async sendTx(data: BlocksoftBlockchainTypes.TransferData, privateData: BlocksoftBlockchainTypes.TransferPrivateData, uiData: BlocksoftBlockchainTypes.TransferUiData): Promise<BlocksoftBlockchainTypes.SendTxResult> {

        if (typeof privateData.privateKey === 'undefined') {
            throw new Error('XRP transaction required privateKey')
        }
        if (typeof data.addressTo === 'undefined') {
            throw new Error('XRP transaction required addressTo')
        }

        const txJson = await this._provider.getPrepared(data, false)


        // https://xrpl.org/rippleapi-reference.html#preparepayment
        // @ts-ignore
        BlocksoftCryptoLog.log(this._settings.currencyCode + ' XrpTransferProcessor.sendTx prepared', txJson)

        // https://xrpl.org/rippleapi-reference.html#sign
        if (typeof data.accountJson !== 'object') {
            try {
                const tmp = JSON.parse(data.accountJson)
                data.accountJson = tmp
            } catch (e) {
                BlocksoftCryptoLog.err(this._settings.currencyCode + ' XrpTransferProcessor.sendTx no accountJson ' + JSON.stringify(data.accountJson))
            }
        }
        if (typeof data.accountJson.publicKey === 'undefined') {
            BlocksoftCryptoLog.err(this._settings.currencyCode + ' XrpTransferProcessor.sendTx no publicKey ' + JSON.stringify(data.accountJson))
            throw new Error('SERVER_RESPONSE_BAD_CODE')
        }


        const result = await this._provider.sendTx(data, privateData, txJson)

        // noinspection ES6MissingAwait
        MarketingEvent.logOnlyRealTime('v20_rippled_any_result ' + data.addressFrom + ' => ' + data.addressTo, {
            txJson,
            result
        })
        // @ts-ignore
        BlocksoftCryptoLog.log(this._settings.currencyCode + ' XrpTransferProcessor.sendTx result', result)

        if (result.resultCode === 'tecNO_DST_INSUF_XRP') {
            throw new Error(result.resultMessage) // not enough - could be replaced by translated
        } else if (result.resultCode === 'tecUNFUNDED_PAYMENT') {
            throw new Error('SERVER_RESPONSE_NOT_ENOUGH_BALANCE_XRP') // not enough to pay
        } else if (result.resultCode === 'tecNO_DST_INSUF_XRP') {
            throw new Error('SERVER_RESPONSE_NOT_ENOUGH_BALANCE_DEST_XRP') // not enough to create account
        } else if (result.resultCode === 'tefBAD_AUTH') {
            throw new Error(result.resultMessage) // not valid key
        } else if (result.resultCode === 'tecDST_TAG_NEEDED') {
            throw new Error('SERVER_RESPONSE_TAG_NEEDED_XRP')
        }

        if (typeof result.tx_json === 'undefined' || typeof result.tx_json.hash === 'undefined') {
            throw new Error(result.resultMessage) // not enough
        }

        if (result.resultCode !== 'tesSUCCESS') {
            return { transactionHash: result.tx_json.hash, successMessage: result.resultMessage } // Held until escalated fee drops
        }

        return { transactionHash: result.tx_json.hash }
    }
}
