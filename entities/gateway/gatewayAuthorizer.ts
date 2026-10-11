import {
  checkAcceptedRecordAgainstPackage,
  parseNumberish
} from "./gatewayChecker.ts";
import type {
  AcceptedRecordLike,
  GatewayCheckResult,
  GatewayDigests,
  GatewayExecutionPackage
} from "./gatewayTypes.ts";

export type GatewayAuthorizationResult = {
  authorized: boolean;
  replay: boolean;
  rho: string;
  match: GatewayCheckResult;
  failures: string[];
};

export class GatewayExecutionAuthorizer {
  private readonly executedRhos = new Set<string>();

  authorizeOnce(
    pkg: GatewayExecutionPackage,
    record: AcceptedRecordLike,
    digests: GatewayDigests
  ): GatewayAuthorizationResult {
    const match = checkAcceptedRecordAgainstPackage(pkg, record, digests);
    const rho = parseNumberish(pkg.rho).toString(10);

    if (!match.accepted) {
      return {
        authorized: false,
        replay: false,
        rho,
        match,
        failures: [...match.failures]
      };
    }

    // Single-process prototype critical section.
    // There must be no await or external callback between has() and add().
    if (this.executedRhos.has(rho)) {
      return {
        authorized: false,
        replay: true,
        rho,
        match,
        failures: ["rhoAlreadyExecuted"]
      };
    }
    this.executedRhos.add(rho);

    return {
      authorized: true,
      replay: false,
      rho,
      match,
      failures: []
    };
  }

  hasExecutedRho(rho: string | bigint): boolean {
    return this.executedRhos.has(parseNumberish(rho).toString(10));
  }
}
