import { Provider } from '@angular/core';
import { AppEnvironment, adapterProviders } from '../../core/config/app-environment';
import {
  AuthorizationReceiptGateway,
  UnavailableAuthorizationReceiptGateway,
} from '../../core/authorization/receipt.gateway';
import {
  ReceiptStepUpGateway,
  UnavailableReceiptStepUpGateway,
} from '../../core/authorization/receipt-step-up.gateway';
import { FinancialAuthorizationDialogs } from './application/financial-authorization.dialogs';

/**
 * The providers of the financial authorization dialog (F1-S6b) for a route that offers it: the receipt step-up and issuance
 * gateways (the F1-S4 demo adapters only where the `financialAuthorization` demo domain is loaded, `unavailable` everywhere
 * else) and the dialog opener. Public, like a feature's routes file. No consumer gateway is bound here: the caller passes its
 * command, and no Billing or Payment command exists in Admin (F1-S6b).
 */
export async function financialAuthorizationProviders(
  environment: AppEnvironment,
): Promise<Provider[]> {
  const receipts = await adapterProviders(environment, 'financialAuthorization', [
    { provide: ReceiptStepUpGateway, useClass: UnavailableReceiptStepUpGateway },
    { provide: AuthorizationReceiptGateway, useClass: UnavailableAuthorizationReceiptGateway },
  ]);
  return [...receipts, FinancialAuthorizationDialogs];
}
