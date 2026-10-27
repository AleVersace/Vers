"use client";

import { t, errorText } from "@/lib/i18n/store";

import { LanguageToggle, useLanguage } from "./LanguageToggle";

import { SourceLink } from "./SourceLink";

import { onAuthStateChanged, type User } from "firebase/auth";
import { useCallback, useEffect, useState } from "react";
import {
  ensureSupabaseRole,
  getFirebaseAuth,
  signInWithGoogle,
  signOutFromVers,
} from "@/lib/firebase/client";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  Campaign,
  CampaignChoice,
  CampaignRole,
  Membership,
} from "@/lib/vers/types";
import { VersTable } from "./VersTable";

type AppStatus =
  | "auth-loading"
  | "signed-out"
  | "loading-campaigns"
  | "ready"
  | "error";

interface MembershipRow {
  campaign_id: string;
  user_id: string;
  role: CampaignRole;
  character_name: string | null;
  campaigns: Campaign | Campaign[] | null;
}

const normalizeCampaign = (
  relation: Campaign | Campaign[] | null,
): Campaign | null => {
  if (Array.isArray(relation)) return relation[0] ?? null;
  return relation;
};

export function VersApp() {
  useLanguage();
  const [status, setStatus] = useState<AppStatus>("auth-loading");
  const [user, setUser] = useState<User | null>(null);
  const [choices, setChoices] = useState<CampaignChoice[]>([]);
  const [selected, setSelected] = useState<CampaignChoice | null>(null);
  const [error, setError] = useState("");

  const loadCampaigns = useCallback(async (firebaseUser: User) => {
    setStatus("loading-campaigns");
    setError("");

    try {
      const isAuthorized = await ensureSupabaseRole(firebaseUser);
      if (!isAuthorized) {
        setChoices([]);
        setSelected(null);
        setStatus("ready");
        return;
      }

      const supabase = getSupabaseBrowserClient();
      const bootstrap = await supabase.rpc("bootstrap_current_user");
      if (bootstrap.error) throw bootstrap.error;

      const result = await supabase
        .from("campaign_members")
        .select(
          "campaign_id,user_id,role,character_name,campaigns(id,name,description,player_scene_id)",
        )
        .eq("user_id", firebaseUser.uid);

      if (result.error) throw result.error;

      const nextChoices = ((result.data ?? []) as unknown as MembershipRow[])
        .map((row) => {
          const campaign = normalizeCampaign(row.campaigns);
          if (!campaign) return null;
          const membership: Membership = {
            campaign_id: row.campaign_id,
            user_id: row.user_id,
            role: row.role,
            character_name: row.character_name,
          };
          return { campaign, membership };
        })
        .filter((choice): choice is CampaignChoice => Boolean(choice));

      setChoices(nextChoices);
      setSelected((current) => {
        if (!current) return null;
        return (
          nextChoices.find(
            (choice) => choice.campaign.id === current.campaign.id,
          ) ?? null
        );
      });
      setStatus("ready");
    } catch (reason) {
      console.error(reason);
      setError(
        reason instanceof Error
          ? reason.message
          : "Non riesco a caricare le campagne.",
      );
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setSelected(null);
      if (!nextUser) {
        setChoices([]);
        setStatus("signed-out");
        return;
      }
      void loadCampaigns(nextUser);
    });
  }, [loadCampaigns]);

  const login = async () => {
    setError("");
    try {
      const credential = await signInWithGoogle();
      setUser(credential.user);
      await loadCampaigns(credential.user);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Accesso Google non riuscito.",
      );
      setStatus("signed-out");
    }
  };

  const logout = async () => {
    setSelected(null);
    await signOutFromVers();
  };

  if (selected && user) {
    return (
      <VersTable
        initialChoice={selected}
        user={user}
        onBack={() => setSelected(null)}
        onLogout={logout}
      />
    );
  }

  return (
    <main className="gate-shell">
      <section className="gate-panel">
        <div className="gate-brand">
          <span className="brand-rune">V</span>
          <span>
            <strong>Vers</strong>
            <small>{t("Il tavolo delle tue avventure")}</small>
          </span>
        </div>

        <div className="gate-utilities"><SourceLink /><LanguageToggle /></div>

        {status === "auth-loading" || status === "loading-campaigns" ? (
          <div className="gate-state">
            <span className="loader" />
            <h1>
              {status === "auth-loading"
                ? t("Apro il tavolo")
                : t("Carico le campagne")}
            </h1>
            <p>{t("Sincronizzazione sicura in corso.")}</p>
          </div>
        ) : status === "signed-out" ? (
          <div className="gate-state">
            <span className="gate-kicker">{t("Tavolo virtuale privato")}</span>
            <h1>{t("Bentornato su Vers")}</h1>
            <p>{t("Accedi con l’account Google autorizzato per visualizzare le tue campagne.")}</p>
            <button className="google-button" onClick={() => void login()}>
              <span>G</span>{t("Continua con Google")}</button>
            {error && <p className="gate-error">{errorText(error)}</p>}
          </div>
        ) : status === "error" ? (
          <div className="gate-state compact">
            <span className="gate-kicker danger">{t("ERRORE")}</span>
            <h1>{t("Il tavolo non risponde.")}</h1>
            <p>{errorText(error)}</p>
            <button
              className="primary-button"
              onClick={() => user && void loadCampaigns(user)}
            >{t("Riprova")}</button>
            <button className="text-button" onClick={() => void logout()}>{t("Esci")}</button>
          </div>
        ) : (
          <div className="campaign-gate">
            <div className="campaign-gate-heading">
              <div>
                <span className="gate-kicker">{t("Le tue campagne")}</span>
                <h1>{t("Continua una campagna")}</h1>
              </div>
              <button className="account-chip" onClick={() => void logout()}>
                {user?.photoURL ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.photoURL} alt="" />
                ) : (
                  <span>{user?.displayName?.slice(0, 1) ?? "A"}</span>
                )}
                <span>
                  <strong>{user?.displayName ?? user?.email}</strong>
                  <small>{t("Esci")}</small>
                </span>
              </button>
            </div>

            {choices.length === 0 ? (
              <div className="empty-campaigns">
                <span>◇</span>
                <h2>{t("Nessuna campagna abilitata")}</h2>
                <p>{t("Il tuo account è valido. Il Master deve aggiungere la tua email a una campagna.")}</p>
              </div>
            ) : (
              <div className="campaign-cards">
                {choices.map((choice, index) => (
                  <button
                    key={choice.campaign.id}
                    className="campaign-card"
                    onClick={() => setSelected(choice)}
                  >
                    <span className="campaign-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="campaign-copy">
                      <small>
                        {choice.membership.role === "master"
                          ? t("MASTER")
                          : choice.membership.character_name ?? t("PLAYER")}
                      </small>
                      <strong>{choice.campaign.name}</strong>
                      <p>
                        {choice.campaign.description ??
                          t("Una campagna Vers pronta da giocare.")}
                      </p>
                    </span>
                    <span className="campaign-arrow">→</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
      <div className="gate-ambient" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </main>
  );
}
