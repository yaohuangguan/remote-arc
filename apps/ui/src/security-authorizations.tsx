import React, { useMemo } from "react";
import type { SecurityGrant } from "@remotearc/protocol";
import { useI18n } from "./i18n.js";
import { groupAuthorizations } from "./security-grant-groups.js";
import "./security-authorizations.css";

type Props = {
  grants: SecurityGrant[];
  busy: boolean;
  preview: boolean;
  timeAgo: (value: string) => string;
  revoke: (grant: SecurityGrant) => Promise<void>;
};

export function SecurityAuthorizations({ grants, busy, preview, timeAgo, revoke }: Props) {
  const { tr, locale } = useI18n();
  const groups = useMemo(() => groupAuthorizations(grants), [grants]);
  const countActive = grants.filter((grant) => grant.status === "active").length;
  const countRefreshable = grants.filter((grant) => grant.status === "refreshable").length;
  const statusName = (status: SecurityGrant["status"]) =>
    status === "active" ? tr("Access valid", "访问有效")
      : status === "refreshable" ? tr("Can refresh", "可刷新")
      : tr("Expired", "已过期");
  const dateTime = (value: string) => new Date(value).toLocaleString(
    locale === "zh" ? "zh-CN" : "en-NZ",
    { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" },
  );
  const expiryDate = (value: string | null) => value
    ? new Date(value).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-NZ",
      { year: "numeric", month: "short", day: "numeric" })
    : tr("Not issued", "未签发");

  return <div className="aiAuthCompact">
    <div className="aiAuthStats">
      <span><strong>{groups.length}</strong> {tr("AI clients", "AI 客户端")}</span>
      <span><strong>{grants.length}</strong> {tr("authorizations", "份授权")}</span>
      <span><i className="aiAuthDot active" />{countActive} {tr("valid access tokens", "份有效访问 Token")}</span>
      {countRefreshable > 0 && <span><i className="aiAuthDot refreshable" />{countRefreshable} {tr("refreshable", "份可刷新")}</span>}
    </div>
    <p className="aiAuthExplain">{tr(
      "These are permissions granted to AI chat clients (OAuth), not your computers' pairing credentials. Select a client to manage its individual authorizations.",
      "这里管理的是 AI 聊天客户端的 OAuth 授权，不是电脑的配对凭证。点击客户端即可管理每份独立授权。",
    )}</p>
    <div className="aiAuthClients">
      {groups.map((group) => {
        const overallStatus = group.active > 0 ? "active" : group.refreshable > 0 ? "refreshable" : "expired";
        return <details className="aiAuthClient" key={group.name.toLocaleLowerCase("en")}>
          <summary className="aiAuthClientSummary">
            <span className="aiAuthIdentity">
              <span className="securityGrantIcon" aria-hidden="true">AI</span>
              <span className="aiAuthNameBlock">
                <strong>{group.name}</strong>
                <small>{group.grants.length} {tr(group.grants.length === 1 ? "authorization" : "authorizations", "份独立授权")}</small>
              </span>
            </span>
            <span className={"grantState " + overallStatus}>{statusName(overallStatus)}</span>
            <span className="aiAuthActivity">{tr("Last token", "最近签发")} · {timeAgo(new Date(group.latest).toISOString())}</span>
            <span className="aiAuthExpand" aria-hidden="true">⌄</span>
          </summary>
          <div className="aiAuthClientBody">
            {group.grants.map((grant) => <details className="aiAuthGrant" key={grant.grantId}>
              <summary className="aiAuthGrantSummary">
                <span className="aiAuthGrantId">
                  <strong>{tr("Authorization", "授权")} · {grant.grantId.slice(0, 10)}…</strong>
                  <small>{tr("Issued", "最近签发")} {timeAgo(grant.lastTokenIssuedAt)}</small>
                </span>
                <span className={"grantState " + grant.status}>{statusName(grant.status)}</span>
                <span className="aiAuthScopeCount">{grant.scopes.length} {tr("permissions", "项权限")}</span>
                <span className="aiAuthExpand" aria-hidden="true">⌄</span>
              </summary>
              <div className="aiAuthGrantBody">
                <dl className="aiAuthGrantMeta">
                  <div><dt>{tr("First authorized", "首次授权")}</dt><dd>{dateTime(grant.authorizedAt)}</dd></div>
                  <div><dt>{tr("Last access token issued", "最近签发访问 Token")}</dt><dd>{dateTime(grant.lastTokenIssuedAt)}</dd></div>
                  <div><dt>{tr("Access token expires", "访问 Token 到期")}</dt><dd>{dateTime(grant.accessExpiresAt)}</dd></div>
                  <div><dt>{tr("Refresh authorization expires", "刷新授权到期")}</dt><dd>{expiryDate(grant.refreshExpiresAt)}</dd></div>
                  <div><dt>{tr("OAuth client ID", "OAuth 客户端 ID")}</dt><dd title={grant.clientId}>{grant.clientId.slice(0, 14)}…</dd></div>
                </dl>
                <div className="aiAuthPermissions">
                  <strong>{tr("Granted permissions", "已授予权限")}</strong>
                  <div className="securityGrantScopes">{grant.scopes.map((scope) => <code key={scope}>{scope}</code>)}</div>
                </div>
                <div className="aiAuthRevokeActions">
                  <small>{tr("Revoking this authorization does not unpair a device or revoke other grants.", "撤销此授权不会解绑设备，也不会影响其他独立授权。")}</small>
                  <button className={grant.status === "expired" ? "ghostButton small" : "dangerButton small"}
                    disabled={preview || busy} onClick={() => void revoke(grant)}>
                    {grant.status === "expired" ? tr("Remove expired authorization", "移除过期授权")
                      : tr("Disconnect this authorization", "断开这份授权")}
                  </button>
                </div>
              </div>
            </details>)}
          </div>
        </details>;
      })}
    </div>
  </div>;
}
