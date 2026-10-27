import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("builds the Vers authenticated virtual tabletop", async () => {
  const [
    page,
    app,
    table,
    supabaseClient,
    realtimeUtility,
    layout,
    icon,
    migration,
    roster,
    characters,
    bootstrapFix,
    conflictFix,
    automaticAuthorization,
    interfaceStyles,
    characterReturningFix,
    characterStorageFix,
    userProfileFields,
    preservedProfileDisplayName,
    characterMacros,
    characterMacroTemporaryBonuses,
    privateTokenStats,
    automaticSceneInitiative,
    sharedCharacterMacrosOnTokens,
    independentMapGridScale,
    campaignDiceRollLog,
    manualEqualInitiativeOrder,
    macroDamageMetadata,
    alignedMacroDamageMetadata,
    accountTableLayout,
    campaignNpcs,
    characterStatsInheritance,
    characterMacroCategories,
    characterMacroOrdering,
    tokenGroupMovement,
    legacyPlayerGrant,
    initiativeGroups,
    expandedMacroName,
    campaignSceneAssets,
    rotatingSceneAssets,
    deadTokenMarker,
    emptyInitiativeGroupCleanup,
    tokenTemporaryHp,
    alignedTokenMoveBounds,
    reliableRealtimeDeletes,
  ] = await Promise.all([
      readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/VersApp.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/VersTable.tsx", import.meta.url), "utf8"),
      readFile(new URL("../lib/supabase/client.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/vers/realtime.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/icon.svg", import.meta.url), "utf8"),
      readFile(
        new URL(
          "../supabase/migrations/202607290002_bootstrap_campaign_access.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/202607290004_campaign_roster.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/202607290005_global_characters.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/202607290007_fix_bootstrap_uid_ambiguity.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/202607290008_fix_bootstrap_conflicts.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../app/api/auth/authorize/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/interface.css", import.meta.url), "utf8"),
      readFile(
        new URL(
          "../supabase/migrations/202608140001_fix_character_insert_returning.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/202608140002_fix_character_storage_policies.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/202608140003_user_profile_fields.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/202608140004_preserve_profile_display_name.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/202608140005_character_macros.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/202608140006_character_macro_temporary_bonuses.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/202608140008_private_token_stats.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/202608140009_automatic_scene_initiative.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/202608140010_shared_character_macros_on_tokens.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/202608150011_independent_map_grid_scale.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/202608150012_campaign_dice_roll_log.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/202608150013_manual_equal_initiative_order.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/202608160014_macro_descriptions_and_damage_types.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/202608160015_keep_macro_damage_metadata_aligned.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/202608160016_account_table_layout.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/202608160017_campaign_npcs.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/202608160018_character_stats_and_token_inheritance.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/202608160019_character_macro_categories.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/202608220020_reorder_character_macros.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/202608220021_move_token_group.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/202608270022_legacy_access_grant.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/202608270023_initiative_groups.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/202608290024_expand_character_macro_name.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/202608290025_campaign_scene_assets.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/202608290026_rotate_scene_assets.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/202608290027_dead_token_marker.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/202608290028_cleanup_empty_initiative_groups.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/202608290029_token_temporary_hp.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/202608290030_align_token_move_bounds_with_rendered_grid.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/202608300031_reliable_realtime_delete_events.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      access(new URL("../.next/BUILD_ID", import.meta.url)),
    ]);

  assert.match(page, /VersApp/);
  assert.match(app, /Continua con Google/);
  assert.match(app, /bootstrap_current_user/);
  assert.match(app, /ensureSupabaseRole/);
  assert.match(app, /Le tue campagne/);
  assert.doesNotMatch(app, /role-missing|Riprova autorizzazione/);
  assert.match(table, /Come Player/);
  assert.match(table, /function FloatingPanel/);
  assert.match(table, /defaultFloatingPanelLayouts/);
  assert.match(table, /normalizeFloatingPanelLayout/);
  assert.match(table, /startInteraction/);
  assert.match(table, /mode: "move" \| "resize"/);
  assert.match(table, /floating-panel-resize/);
  assert.match(table, /table_layout/);
  assert.match(table, /saveFloatingPanelLayouts/);
  assert.match(table, /flushFloatingPanelLayouts/);
  assert.match(table, /floatingLayoutSaveInFlightRef/);
  assert.match(table, /floatingLayoutSavePendingRef/);
  assert.match(table, /includeTableLayout/);
  assert.match(table, /loadUserProfile\(true\)/);
  assert.match(table, /layoutRevisionAtRequest/);
  assert.match(table, /Reset layout/);
  assert.match(table, /Pannelli personali del tavolo/);
  assert.match(table, /type PanelDockMode = "right" \| "left" \| "floating"/);
  assert.match(table, /function DockablePanelHost/);
  assert.match(table, /defaultPanelDockPlacements/);
  assert.match(table, /rightRailCollapsed/);
  assert.match(table, /dockable-detail-rail/);
  assert.match(table, /rail-panel-stack/);
  assert.match(table, /"scenes-list"/);
  assert.match(table, /"characters-list"/);
  assert.match(table, /"campaign-assets"/);
  assert.match(table, /"asset-library"/);
  assert.match(table, /version: 4/);
  assert.match(table, /dockedHeight/);
  assert.match(table, /docked-panel-resize/);
  assert.match(table, /startDockResize/);
  assert.match(table, /moveDockResize/);
  assert.match(table, /application\/x-vers-panel/);
  assert.match(table, /dropPanelInRail/);
  assert.match(table, /dropRelativeToDockedPanel/);
  assert.match(table, /application\/x-vers-asset/);
  assert.match(table, /application\/x-vers-character/);
  assert.match(table, /application\/x-vers-scene-asset/);
  assert.match(table, /uploadCampaignSceneAsset/);
  assert.match(table, /Carica il primo asset/);
  assert.match(table, /defaultSceneAssetDimensions/);
  assert.match(table, /mode: "scene-asset-move"/);
  assert.match(table, /mode: "scene-asset-resize"/);
  assert.match(table, /mode: "scene-asset-rotate"/);
  assert.match(table, /startSceneAssetRotation/);
  assert.match(table, /board-scene-asset-rotate/);
  assert.match(table, /rotate\(\$\{placement\.rotation\}deg\)/);
  assert.match(table, /persistSceneAssetGeometry/);
  assert.match(table, /deleteSceneAssetPlacement/);
  assert.match(table, /from\("scene_assets"\)/);
  assert.match(table, /Filtra NPC per nome/);
  assert.match(table, /filteredCampaignNpcs/);
  assert.match(table, /Macro dell’NPC/);
  assert.match(table, /Modifica NPC/);
  assert.match(table, /Elimina NPC/);
  assert.match(table, /tasto destro per scegliere la forma/);
  assert.match(table, /Mano libera/);
  assert.match(table, /Quadrato/);
  assert.match(table, /Cerchio/);
  assert.match(table, /Gomma/);
  assert.match(table, /Pulisci tutto/);
  assert.match(table, /eraseDrawingsAtPoint/);
  assert.match(table, /drawingTouchesPoint/);
  assert.doesNotMatch(table, /<small>Pulisci<\/small>/);
  assert.match(table, /Righello/);
  assert.match(table, /measurementLine/);
  assert.match(table, /fogBrushSize/);
  assert.match(table, /Lato del quadrato/);
  assert.match(table, /fogBrushPreviewBounds/);
  assert.match(table, /Statistiche base/);
  assert.match(table, /copiate nei nuovi token/);
  assert.match(table, /playerView \? "characters-only" : ""/);
  assert.match(table, /isMaster && !playerView && \(/);
  assert.match(table, /headerActions=/);
  assert.match(table, /layout\.collapsed \? t\("Espandi/);
  assert.match(table, /className=\{`section-collapse/);
  assert.match(table, /m7 10 5 5 5-5/);
  assert.match(table, /Apri pannello laterale/);
  assert.match(table, /Nuovo personaggio/);
  assert.match(table, /Modifica personaggio/);
  assert.match(table, /Elimina personaggio/);
  assert.match(table, /updateCharacter/);
  assert.match(table, /deleteCharacter/);
  assert.match(table, /Lascia vuoto per mantenere il token attuale/);
  assert.match(table, /I token già sulla mappa resteranno/);
  assert.match(table, /Apri menu account/);
  assert.match(table, /Il tuo profilo/);
  assert.match(table, /Salva profilo/);
  assert.match(table, /profileFirstName/);
  assert.match(table, /profileLastName/);
  assert.match(table, /profileNickname/);
  assert.match(table, /Macro del personaggio/);
  assert.match(table, /Nuova macro/);
  assert.match(table, /Modifica macro/);
  assert.match(table, /Salva macro/);
  assert.match(table, /macroDiceSides/);
  assert.match(table, /macroBonuses/);
  assert.match(table, /Damage macro/);
  assert.match(table, /macroDescription/);
  assert.match(table, /DamageTypePicker/);
  assert.match(table, /createPortal/);
  assert.match(table, /updatePopoverPosition/);
  assert.match(table, /spaceBelow >= 160 \|\| spaceBelow >= spaceAbove/);
  assert.match(table, /window\.addEventListener\("scroll", reposition, true\)/);
  assert.match(table, /macroDiceDamageTypes/);
  assert.match(table, /macroBonusDamageTypes/);
  assert.match(table, /temporaryDiceDamageTypes/);
  assert.match(table, /temporaryBonusDamageTypes/);
  assert.match(table, /damageTypeSuffix/);
  assert.match(table, /macro-action-description/);
  assert.match(table, /token-macro-copy/);
  assert.match(table, /Bonus temp/);
  assert.match(table, /temporaryDiceSides/);
  assert.match(table, /temporaryBonuses/);
  assert.match(table, /macro-temporary-badge/);
  assert.match(table, /Rimuovi bonus temp/);
  assert.match(table, /temporary_dice_sides/);
  assert.match(table, /temporary_bonuses/);
  assert.match(table, /rollMacro/);
  assert.match(table, /crypto\.getRandomValues/);
  assert.match(table, /onClick=\{\(\) => rollMacro\(macro, source\)\}/);
  assert.match(table, /onContextMenu=\{\(event\) =>/);
  assert.match(table, /macroRollResult\.rolling/);
  assert.match(table, /onPointerDown=\{\(event\) => \{/);
  assert.match(table, /closeMacroRollResult\(\)/);
  assert.match(table, /macroRollSequenceRef\.current \+= 1/);
  assert.match(table, /openMacroCharacterIds/);
  assert.match(table, /collapsedMacroCharacterIds/);
  const macroDockRow = await readFile(new URL("../app/MacroDockRow.tsx", import.meta.url), "utf8");
  assert.match(macroDockRow, /className="macro-docks"/);
  assert.match(table, /className="macro-dock-heading"/);
  assert.match(table, /QUICK_DIE_STORAGE_KEY/);
  assert.match(table, /QUICK_DIE_PRESETS = \[4, 6, 8, 10, 12, 20, 100\]/);
  assert.match(table, /quickDieSides/);
  assert.match(table, /onClick=\{rollQuickDie\}/);
  assert.match(table, /chooseQuickDie\(quickDieInput\)/);
  assert.match(table, /Facce personalizzate/);
  assert.match(table, /quick-die-menu/);
  assert.doesNotMatch(table, /openMacroCharacters\.length > 0 &&/);
  assert.match(table, /recordDiceRoll/);
  assert.match(table, /from\("dice_roll_log"\)/);
  assert.match(table, /event: "dice_roll"/);
  assert.match(table, /--roller-color/);
  assert.match(table, /entry\.actor_name/);
  assert.match(table, /canSeeMacroRollName/);
  assert.match(table, /entry\.roller_user_id === user\.uid/);
  assert.match(table, /character\?\.owner_user_id === user\.uid/);
  assert.match(table, /token\.name === entry\.actor_name/);
  assert.match(table, /entry\.roll_name/);
  assert.match(table, /entry\.roller_name/);
  assert.doesNotMatch(table, /"Macro roll"/);
  assert.match(table, /without-actor/);
  assert.match(table, /dice-roll-log-breakdown-lines/);
  assert.match(table, /className="dice-roll-log-name"/);
  assert.match(table, /className="dice-roll-log-actor"/);
  assert.match(table, /<output>\{entry\.total\}<\/output>/);
  assert.match(table, /<code>\{localizeRollBreakdown\(entry\.breakdown, getLanguage\(\)\)\}<\/code>/);
  assert.match(table, /damageRollBreakdownLines/);
  assert.match(table, /gridSquaresBetween/);
  assert.doesNotMatch(table, /rollTimeFormatter/);
  assert.doesNotMatch(table, /dice-roll-log-roller/);
  assert.match(interfaceStyles, /\.dice-roll-log-entry\.without-actor/);
  assert.match(table, /selectedTokenCharacter/);
  assert.match(table, /selectedTokenMacros/);
  assert.match(table, /className="token-detail-section token-macro-section"/);
  assert.match(table, /tokenStatsCollapsed/);
  assert.match(table, /tokenSavesCollapsed/);
  assert.match(table, /tokenMacrosCollapsed/);
  assert.match(
    table,
    /\[tokenStatsCollapsed, setTokenStatsCollapsed\] = useState\(true\)/,
  );
  assert.match(
    table,
    /\[tokenSavesCollapsed, setTokenSavesCollapsed\] = useState\(true\)/,
  );
  assert.match(
    table,
    /\[tokenMacrosCollapsed, setTokenMacrosCollapsed\] = useState\(true\)/,
  );
  assert.match(table, /token-section-toggle/);
  assert.match(table, /token-macro-row/);
  assert.match(table, /MACRO_DRAG_MIME/);
  assert.match(table, /reorderCharacterMacro/);
  assert.match(table, /beginMacroDrag/);
  assert.match(table, /moveMacroOverTarget/);
  assert.match(table, /dropMacroOnTarget/);
  assert.match(table, /rpc\("reorder_character_macro"/);
  assert.match(table, /trascina per riordinare/);
  assert.match(table, /title=\{macro\.name\}/);
  assert.match(table, /Condivise con il personaggio e con tutti i suoi token/);
  assert.match(table, /renderMacroDiamond\(macro, "token"\)/);
  assert.match(table, /className="macro-board-tooltip" role="tooltip"/);
  assert.match(table, /selectedTokenIds/);
  assert.match(table, /tokenSelectionBox/);
  assert.match(table, /mode: "token-select"/);
  assert.match(table, /updateTokenSelectionBox/);
  assert.match(table, /mode: "token-resize"/);
  assert.match(table, /startTokenResize/);
  assert.match(table, /resizeToken/);
  assert.match(table, /endTokenResize/);
  assert.match(table, /Math\.round\(Math\.max\(horizontalCells, verticalCells\)\)/);
  assert.match(table, /activeGridColumns - resize\.tokenX/);
  assert.match(table, /board-token-resize-handle/);
  assert.match(table, /rpc\("move_token_group"/);
  assert.match(table, /origins: TokenMoveOrigin\[\]/);
  assert.match(table, /applyOptimisticTokenPositions/);
  assert.match(table, /restoreMatchingOptimisticTokenPositions/);
  assert.match(table, /clearMatchingOptimisticTokenPositions/);
  assert.match(table, /hasMatchingOptimisticTokenPosition/);
  assert.match(table, /tokenMoveSaveCoordinatorRef/);
  assert.match(table, /tableLifecycleActiveRef/);
  assert.match(table, /TOKEN_MOVE_CONFIRMATION_DELAY_MS = 1_000/);
  assert.match(table, /VERS token move confirmation failed/);
  assert.match(table, /tokenCount/);
  assert.match(table, /multi-selected/);
  assert.match(table, /token-selection-summary/);
  assert.match(table, /deleteSelectedTokens/);
  assert.match(table, /deletingTokenSelection/);
  assert.match(table, /Azioni selezione multipla/);
  assert.match(table, /t\("Elimina \{p0\} token", \{ p0: selectedTokenIds\.length \}\)/);
  assert.match(table, /\.in\("id", tokenIds\)/);
  assert.match(table, /menuOpen && renderMacroActionMenu\(macro, source\)/);
  assert.doesNotMatch(table, /selectedTokenMenuMacro/);
  assert.match(
    table,
    /openMacroCreator\(\s*selectedTokenCharacter,\s*false,?\s*\)/,
  );
  assert.ok(
    table.indexOf('className="token-detail-section token-macro-section"') >
      table.indexOf('className="token-detail-section saving-throws"'),
  );
  assert.ok(
    table.indexOf('className="macro-diamond add"') >
      table.indexOf("macros.map((macro)"),
  );
  assert.match(table, /onContextMenu/);
  assert.match(table, /event\.button !== 2/);
  assert.match(table, /onPointerDown=\{viewportPointerDown\}/);
  assert.doesNotMatch(table, /id: "ping"/);
  assert.match(table, /BOARD_INTERACTIVE_SELECTOR/);
  assert.match(table, /target\.closest\(BOARD_INTERACTIVE_SELECTOR\)/);
  assert.match(table, /if \(tool === "select"\)/);
  assert.match(table, /const PING_HOLD_MS = 1000/);
  assert.match(table, /mode: "ping"/);
  assert.match(table, /PING_HOLD_MOVE_TOLERANCE_PX/);
  assert.match(table, /firePing\(pendingPing\.x, pendingPing\.y\)/);
  assert.match(table, /onPointerMove=\{viewportPointerMove\}/);
  assert.doesNotMatch(table, /label: "Sposta"/);
  assert.match(table, /movementLine/);
  assert.match(table, /PING_LIFETIME_MS = 3600/);
  assert.match(table, /TOKEN_SAVE_DEBOUNCE_MS = 500/);
  assert.match(table, /sortedInitiative/);
  assert.match(table, /deadInitiativeEntryIds/);
  assert.match(table, /runnableInitiative/);
  assert.match(table, /deadInitiativeEntryIds\.has\(candidate\.id\)/);
  assert.match(table, /skipped \? "skipped"/);
  assert.match(table, /tutti morti/);
  assert.match(table, /swapEqualInitiativeEntries/);
  assert.match(table, /swap_equal_initiative_entries/);
  assert.match(table, /previousEntry\?\.initiative === entry\.initiative/);
  assert.match(table, /nextEntry\?\.initiative === entry\.initiative/);
  assert.match(table, /initiative-order-controls/);
  assert.match(table, /pendingTokenPatchesRef/);
  assert.match(table, /optimisticTokenPatchesRef/);
  assert.match(table, /sceneLoadSequenceRef/);
  assert.match(table, /supabase\.realtime\.setAuth\(\)/);
  assert.doesNotMatch(table, /setAuth\(firebaseToken\)/);
  assert.match(supabaseClient, /worker: true/);
  assert.match(supabaseClient, /heartbeatIntervalMs: 15_000/);
  assert.match(table, /replication_ready: true/);
  assert.match(table, /\.on\("system", \{\},/);
  assert.match(table, /payload\.extension !== "system"/);
  assert.match(table, /reconcileRealtimeState/);
  assert.match(table, /reconcileForAttempt/);
  assert.match(table, /reconciliationSequence/);
  assert.doesNotMatch(table, /realtimeReconcileRef/);
  assert.match(table, /campaignLoadSequenceRef/);
  assert.match(table, /diceRollLogLoadSequenceRef/);
  assert.match(table, /characterMacrosLoadSequenceRef/);
  assert.match(table, /macroCategoriesLoadSequenceRef/);
  assert.match(table, /const loadLatest = async/);
  assert.match(table, /campaignResult\.sceneId/);
  assert.match(realtimeUtility, /const serverIds = new Set/);
  assert.match(
    realtimeUtility,
    /\.filter\(\(entry\) => !serverIds\.has\(entry\.id\)\)/,
  );
  assert.match(table, /refreshAssetUrls\(\s*rows,\s*assetUrlsRef\.current/);
  assert.match(table, /realtimeWithRemoval\._remove\(channel\)/);
  assert.match(
    table,
    /supabase\.realtime\.getChannels\(\)\.includes\(channel\)/,
  );
  assert.match(table, /vers-handoff:/);
  assert.match(table, /finally \{\s*forgetRealtimeChannel\(handoffChannel\)/);
  assert.match(realtimeUtility, /createKeyedTaskQueue/);
  assert.match(table, /runRealtimeChannelLifecycleTask\(channelLifecycleKey/);
  assert.match(table, /pendingRefreshResources/);
  assert.match(table, /REALTIME_REFRESH_DEBOUNCE_MS = 90/);
  assert.match(table, /eventTouchesActiveScene/);
  assert.match(table, /invalidateLatestLoad\(sceneLoadSequenceRef\)/);
  assert.match(table, /runRealtimeRefresh/);
  assert.match(table, /Realtime \$\{label\} refresh failed/);
  assert.match(table, /databaseReady && broadcastReady/);
  assert.match(table, /supabase\.realtime\.onHeartbeat/);
  assert.match(table, /status === "disconnected"/);
  assert.match(table, /document\.addEventListener\("visibilitychange"/);
  assert.match(table, /window\.addEventListener\("online"/);
  assert.match(table, /REALTIME_WATCHDOG_IDLE_MS = 60_000/);
  assert.match(table, /REALTIME_WATCHDOG_HARD_MS = 120_000/);
  assert.match(table, /REALTIME_RECONCILIATION_DEADLINE_MS = 30_000/);
  assert.match(table, /lastSuccessfulReconciliationAt/);
  assert.match(table, /shouldRunRealtimeWatchdog/);
  assert.match(table, /withRealtimeDeadline/);
  assert.match(table, /invalidateRealtimeLoads/);
  assert.match(table, /watchdog di sincronizzazione/);
  assert.match(table, /table: "scene_delete_events"/);
  assert.match(table, /incoming\.scene_id !== activeSceneIdRef\.current/);
  assert.match(
    table,
    /if \(databaseReady && broadcastReady\) \{[\s\S]*?reconcileForAttempt/,
  );
  assert.match(table, /Riconnetti e riallinea il tavolo/);
  assert.match(table, /vers-db:/);
  assert.match(table, /Realtime non disponibile/);
  assert.match(table, /interface TokenVisibilityBroadcast/);
  assert.match(table, /event: "token_visibility"/);
  assert.match(table, /typeof tokenPatch\.visible_to_players === "boolean"/);
  assert.match(table, /is_dead: row\.is_dead === true/);
  assert.match(table, /Token morto/);
  assert.match(table, /board-token-dead-mark/);
  assert.match(table, /updateToken\(\{ is_dead: event\.target\.checked \}\)/);
  assert.match(table, /"temp_hp"/);
  assert.match(table, /selectedToken\.temp_hp/);
  assert.match(table, /HP TEMP/);
  assert.doesNotMatch(table, /characterStatsDraft\.temp_hp/);
  assert.doesNotMatch(table, /!incoming\.visible && !hasMasterAccessRef\.current/);
  assert.match(table, /token\.owner_user_id === user\.uid/);
  assert.match(table, /eventType === "INSERT"/);
  assert.match(table, /drawing\.id === incoming\.id/);
  assert.match(table, /style: \{ color: rollerColor\(user\.uid\), width: 4 \}/);
  assert.match(table, /rollerColor\(drawing\.author_user_id\)/);
  assert.match(table, /hasMasterAccess \|\|/);
  assert.match(table, /canViewSelectedTokenStats/);
  assert.match(table, /Statistiche private/);
  assert.match(table, /from\("token_stats"\)/);
  assert.match(table, /table: "token_stats"/);
  assert.match(table, /ft ·/);
  assert.match(table, /Carica mappa dal PC/);
  assert.match(table, /gridRowsForMap/);
  assert.match(table, /activeBoardWidth \/ activeMapAspectRatio/);
  assert.match(table, /activeScene\.map_width_px/);
  assert.match(table, /activeGridColumns/);
  assert.match(table, /Dimensione casella/);
  assert.match(table, /Mappa invariata/);
  assert.match(table, /updateGridCellSize/);
  assert.match(table, /Più fitta/);
  assert.doesNotMatch(table, /Scala mappa e griglia/);
  assert.match(table, /sceneScaleSaveTimersRef/);
  assert.match(table, /const deleteScene = async/);
  assert.match(table, /Eliminare definitivamente/);
  assert.match(table, /className="scene-danger-zone"/);
  assert.match(table, /Elimina scena/);
  assert.doesNotMatch(table, /Scena vuota/);
  assert.doesNotMatch(table, /Il Master non ha ancora caricato una mappa/);
  assert.match(table, /Nebbia attiva/);
  assert.match(table, /Iniziativa/);
  assert.doesNotMatch(table, /addToInitiative|removeFromInitiative/);
  assert.doesNotMatch(table, /className="initiative-remove"/);
  assert.doesNotMatch(table, /＋ Iniziativa/);
  assert.match(table, /Tiri salvezza/);
  assert.match(layout, /Vers/);
  assert.match(layout, /Vers - Il tavolo virtuale per le tue avventure/);
  assert.doesNotMatch(page + layout, /—/);
  assert.match(icon, /viewBox="0 0 64 64"/);
  assert.match(icon, /#d7a15d/);
  assert.match(layout, /interface\.css/);
  assert.doesNotMatch(migration + roster + legacyPlayerGrant, /gmail/);
  assert.match(characters, /create table public\.characters/);
  assert.match(characters, /characters_owner_name_idx/);
  assert.match(characters, /add column character_id/);
  assert.match(bootstrapFix, /current_uid_value/);
  assert.match(conflictFix, /campaign_members_pkey/);
  assert.match(automaticAuthorization, /verifyIdToken/);
  assert.match(automaticAuthorization, /campaign_access_grants/);
  assert.match(automaticAuthorization, /setCustomUserClaims/);
  assert.match(interfaceStyles, /Vers interface system/);
  assert.match(interfaceStyles, /font-size: 15px/);
  assert.match(interfaceStyles, /prefers-reduced-motion/);
  assert.match(interfaceStyles, /vers-ping-wave/);
  assert.match(interfaceStyles, /realtime-connecting/);
  assert.match(interfaceStyles, /rail-heading-actions/);
  assert.match(interfaceStyles, /map-scale-control/);
  assert.match(interfaceStyles, /scale\(3\.15\)/);
  assert.match(interfaceStyles, /background: conic-gradient\(/);
  assert.match(interfaceStyles, /transform: rotate\(45deg\)/);
  assert.match(interfaceStyles, /transform: rotate\(-45deg\)/);
  assert.match(interfaceStyles, /@keyframes macro-die-tumble/);
  assert.match(interfaceStyles, /@keyframes macro-result-reveal/);
  assert.match(interfaceStyles, /\.token-macro-section/);
  assert.match(interfaceStyles, /\.token-macro-list/);
  assert.match(interfaceStyles, /\.token-section-toggle/);
  assert.match(interfaceStyles, /\.token-macro-row/);
  assert.match(interfaceStyles, /\.token-macro-copy/);
  assert.match(interfaceStyles, /\.macro-reorderable/);
  assert.match(interfaceStyles, /\.macro-reorder-dragging/);
  assert.match(interfaceStyles, /\.macro-drop-before/);
  assert.match(interfaceStyles, /\.macro-drop-after/);
  assert.match(interfaceStyles, /\.board-token\.multi-selected/);
  assert.match(interfaceStyles, /\.board-token-resize-handle/);
  assert.match(interfaceStyles, /\.token-dead-toggle/);
  assert.match(interfaceStyles, /\.token-dead-toggle\.active/);
  assert.match(interfaceStyles, /\.token-selection-box/);
  assert.match(interfaceStyles, /\.token-selection-summary/);
  assert.match(interfaceStyles, /\.token-selection-summary > button/);
  assert.match(interfaceStyles, /bottom: 52px/);
  assert.match(interfaceStyles, /transform: translateX\(-50%\)/);
  assert.match(interfaceStyles, /token-selection-hud-in/);
  assert.match(interfaceStyles, /\.damage-macro-toggle/);
  assert.match(interfaceStyles, /\.damage-type-picker/);
  assert.match(interfaceStyles, /\.damage-type-options/);
  assert.match(interfaceStyles, /\.damage-type-options\.opens-above/);
  assert.match(interfaceStyles, /\.eraser-tool-menu/);
  assert.match(interfaceStyles, /\.fog-brush-menu/);
  assert.match(interfaceStyles, /\.fog-brush-preview/);
  assert.match(interfaceStyles, /\.floating-panels-layer/);
  assert.match(interfaceStyles, /\.floating-panel-header/);
  assert.match(interfaceStyles, /\.floating-panel-resize/);
  assert.match(interfaceStyles, /\.dockable-detail-rail/);
  assert.match(interfaceStyles, /\.docked-rail-panel/);
  assert.match(interfaceStyles, /\.rail-panel-stack/);
  assert.match(interfaceStyles, /\.docked-panel-controls/);
  assert.match(interfaceStyles, /\.docked-panel-resize/);
  assert.match(interfaceStyles, /cursor: row-resize/);
  assert.match(interfaceStyles, /\.docked-section-stack/);
  assert.match(interfaceStyles, /\.layout-reset-button/);
  assert.match(interfaceStyles, /cursor: nwse-resize/);
  assert.match(interfaceStyles, /position: fixed/);
  assert.match(interfaceStyles, /@keyframes damage-type-options-in/);
  assert.match(
    interfaceStyles,
    /\.token-macro-section \.macro-action-menu\.token \{[\s\S]*?position: absolute/,
  );
  assert.match(interfaceStyles, /text-overflow: ellipsis/);
  assert.match(interfaceStyles, /\.quick-die-dock/);
  assert.match(interfaceStyles, /\.macro-diamond\.quick-die/);
  assert.match(interfaceStyles, /\.macro-diamond-board:hover > \.macro-board-tooltip/);
  assert.match(interfaceStyles, /\.quick-die-presets/);
  assert.match(interfaceStyles, /\.dice-roll-log-panel/);
  assert.match(interfaceStyles, /\.dice-roll-log-entry/);
  assert.match(interfaceStyles, /\.dice-roll-log-name/);
  assert.match(interfaceStyles, /\.dice-roll-log-actor/);
  assert.match(interfaceStyles, /grid-row: 1 \/ span 2/);
  assert.match(interfaceStyles, /grid-column: 1 \/ -1/);
  assert.match(interfaceStyles, /\.initiative-entry\.has-order-controls/);
  assert.match(interfaceStyles, /\.initiative-order-controls/);
  assert.match(interfaceStyles, /\.initiative-entry\.skipped/);
  assert.match(interfaceStyles, /\.initiative-group-member\.dead/);
  assert.match(interfaceStyles, /grid-auto-flow: column/);
  assert.match(interfaceStyles, /--macro-row-count/);
  assert.match(table, /Math\.ceil\(\s*uncategorized\.length \/ 2/);
  assert.match(table, /Math\.ceil\(\s*sectionMacros\.length \/ 2/);
  assert.match(table, /uncategorized\.length > 0 &&/);
  assert.match(table, /macro-category-divider board uncategorized/);
  assert.doesNotMatch(table, /macroRowsForViewport/);
  assert.match(interfaceStyles, /grid-template-rows: minmax\(0, 1fr\) 38px/);
  assert.match(interfaceStyles, /"top top top top top" 52px/);
  assert.match(interfaceStyles, /\.board-status > span:first-child/);
  assert.match(characterReturningFix, /alter policy/);
  assert.match(characterReturningFix, /owner_user_id = public\.current_firebase_uid/);
  assert.match(characterStorageFix, /owns_character_storage_object/);
  assert.match(characterStorageFix, /target_storage_path/);
  assert.match(userProfileFields, /add column if not exists first_name text/);
  assert.match(userProfileFields, /add column if not exists last_name text/);
  assert.match(userProfileFields, /add column if not exists nickname text/);
  assert.match(preservedProfileDisplayName, /existing\.nickname/);
  assert.match(preservedProfileDisplayName, /existing\.first_name/);
  assert.match(preservedProfileDisplayName, /add table public\.app_users/);
  assert.match(characterMacros, /create table public\.character_macros/);
  assert.match(characterMacros, /dice_sides integer\[\]/);
  assert.match(characterMacros, /bonuses integer\[\]/);
  assert.match(characterMacros, /public\.owns_character\(character_id\)/);
  assert.match(table, /const MACRO_NAME_MAX_LENGTH = 64/);
  assert.match(table, /maxLength=\{MACRO_NAME_MAX_LENGTH\}/);
  assert.match(table, /name\.length > MACRO_NAME_MAX_LENGTH/);
  assert.match(
    expandedMacroName,
    /drop constraint if exists character_macros_name_length/,
  );
  assert.match(
    expandedMacroName,
    /char_length\(trim\(name\)\) between 1 and 64/,
  );
  assert.match(campaignSceneAssets, /alter type public\.asset_kind[\s\S]*'prop'/);
  assert.match(campaignSceneAssets, /create table public\.scene_assets/);
  assert.match(campaignSceneAssets, /Scene viewers can read placed assets/);
  assert.match(campaignSceneAssets, /Masters can place scene assets/);
  assert.match(campaignSceneAssets, /visible_to_players boolean/);
  assert.match(campaignSceneAssets, /alter publication supabase_realtime add table public\.scene_assets/);
  assert.match(rotatingSceneAssets, /alter table public\.scene_assets/);
  assert.match(rotatingSceneAssets, /add column rotation numeric not null default 0/);
  assert.match(rotatingSceneAssets, /rotation >= 0 and rotation < 360/);
  assert.match(deadTokenMarker, /alter table public\.tokens/);
  assert.match(deadTokenMarker, /add column is_dead boolean not null default false/);
  assert.match(emptyInitiativeGroupCleanup, /cleanup_empty_initiative_group/);
  assert.match(emptyInitiativeGroupCleanup, /after delete on public\.initiative_entries/);
  assert.match(emptyInitiativeGroupCleanup, /old\.group_entry_id is not null/);
  assert.match(characterMacroTemporaryBonuses, /temporary_dice_sides integer\[\]/);
  assert.match(characterMacroTemporaryBonuses, /temporary_bonuses integer\[\]/);
  assert.match(macroDamageMetadata, /add column description text/);
  assert.match(macroDamageMetadata, /add column is_damage_macro boolean/);
  assert.match(macroDamageMetadata, /dice_damage_types text\[\]/);
  assert.match(macroDamageMetadata, /bonus_damage_types text\[\]/);
  assert.match(macroDamageMetadata, /temporary_dice_damage_types text\[\]/);
  assert.match(macroDamageMetadata, /temporary_bonus_damage_types text\[\]/);
  assert.match(macroDamageMetadata, /char_length\(description\) <= 120/);
  assert.match(macroDamageMetadata, /cardinality\(dice_damage_types\)/);
  assert.match(macroDamageMetadata, /'acid'/);
  assert.match(macroDamageMetadata, /'bludgeoning'/);
  assert.match(macroDamageMetadata, /'thunder'/);
  assert.match(
    alignedMacroDamageMetadata,
    /create function public\.keep_macro_damage_metadata_aligned/,
  );
  assert.match(
    alignedMacroDamageMetadata,
    /generate_series\(1, cardinality\(new\.dice_sides\)\)/,
  );
  assert.match(
    alignedMacroDamageMetadata,
    /before insert or update on public\.character_macros/,
  );
  assert.match(accountTableLayout, /add column table_layout jsonb/);
  assert.match(accountTableLayout, /app_users_table_layout_object/);
  assert.match(accountTableLayout, /jsonb_typeof\(table_layout\) = 'object'/);
  assert.match(campaignNpcs, /add column campaign_id uuid/);
  assert.match(campaignNpcs, /kind in \('player', 'npc'\)/);
  assert.match(campaignNpcs, /create or replace function public\.can_manage_character/);
  assert.match(campaignNpcs, /character\.kind = 'npc'/);
  assert.match(campaignNpcs, /NPC belongs to a different campaign/);
  assert.match(campaignNpcs, /from public\.assets asset/);
  assert.match(characterStatsInheritance, /create table public\.character_stats/);
  assert.match(
    characterStatsInheritance,
    /public\.can_manage_character\(character_id\)/,
  );
  assert.match(
    characterStatsInheritance,
    /create function public\.inherit_character_stats_on_token/,
  );
  assert.match(characterStatsInheritance, /insert into public\.token_stats/);
  assert.match(characterStatsInheritance, /after insert on public\.tokens/);
  assert.match(
    characterMacroCategories,
    /create table public\.character_macro_categories/,
  );
  assert.match(
    characterMacroCategories,
    /on delete set null \(category_id\)/,
  );
  assert.match(
    characterMacroCategories,
    /public\.can_manage_character_macros\(character_id\)/,
  );
  assert.match(table, /macro-category-divider/);
  assert.match(table, /Senza sezione/);
  assert.match(table, /macroDiceCounts/);
  assert.match(table, /expandDiceByCounts/);
  assert.match(table, /rollerColor/);
  assert.match(table, /title=\{t\("Rolls"\)\}/);
  assert.match(table, /title=\{t\("PG"\)\}/);
  assert.match(table, /title=\{t\("NPC"\)\}/);
  assert.match(
    characterMacroOrdering,
    /create or replace function public\.reorder_character_macro/,
  );
  assert.match(
    characterMacroOrdering,
    /public\.can_manage_character_macros\(dragged_macro\.character_id\)/,
  );
  assert.match(characterMacroOrdering, /for update/);
  assert.match(characterMacroOrdering, /category_id = target_macro\.category_id/);
  assert.match(characterMacroOrdering, /grant execute/);
  assert.match(
    tokenGroupMovement,
    /create or replace function public\.move_token_group/,
  );
  assert.match(tokenGroupMovement, /public\.can_view_scene\(p_scene_id\)/);
  assert.match(
    tokenGroupMovement,
    /target_token\.owner_user_id = public\.current_firebase_uid/,
  );
  assert.match(tokenGroupMovement, /for update of token/);
  assert.match(tokenGroupMovement, /target_token\.locked/);
  assert.match(tokenGroupMovement, /grant execute/);
  assert.match(tokenTemporaryHp, /alter table public\.token_stats/);
  assert.match(tokenTemporaryHp, /add column temp_hp numeric/);
  assert.doesNotMatch(tokenTemporaryHp, /alter table public\.character_stats/);
  assert.match(
    alignedTokenMoveBounds,
    /create or replace function public\.move_token_group/,
  );
  assert.match(alignedTokenMoveBounds, /scene\.map_width_px/);
  assert.match(alignedTokenMoveBounds, /scene\.grid_cell_px/);
  assert.match(alignedTokenMoveBounds, /map_asset\.height/);
  assert.match(alignedTokenMoveBounds, /ceil\(/);
  assert.match(reliableRealtimeDeletes, /create table public\.scene_delete_events/);
  assert.match(reliableRealtimeDeletes, /scene_id uuid/);
  assert.match(
    reliableRealtimeDeletes,
    /Campaign members can read scene delete events/,
  );
  assert.match(
    reliableRealtimeDeletes,
    /before delete on public\.tokens/,
  );
  assert.match(
    reliableRealtimeDeletes,
    /before delete on public\.drawings/,
  );
  assert.match(
    reliableRealtimeDeletes,
    /alter publication supabase_realtime add table public\.scene_delete_events/,
  );
  assert.match(
    legacyPlayerGrant,
    /Historical operational migration intentionally empty/,
  );
  assert.match(
    initiativeGroups,
    /alter column token_id drop not null/,
  );
  assert.match(initiativeGroups, /add column group_entry_id uuid/);
  assert.match(
    initiativeGroups,
    /create function public\.merge_initiative_group/,
  );
  assert.match(initiativeGroups, /initiative_entries_group_shape/);
  assert.match(table, /merge_initiative_group/);
  assert.match(table, /Unisci iniziativa/);
  assert.match(table, /initiative-group-member/);
  assert.match(table, /Sciogli gruppo/);
  assert.match(table, /initiativeMembersByGroup/);
  assert.match(table, /merge-candidate/);
  assert.match(privateTokenStats, /create table public\.token_stats/);
  assert.match(privateTokenStats, /can_view_token_stats/);
  assert.match(privateTokenStats, /drop column hp_current/);
  assert.match(automaticSceneInitiative, /add_token_to_scene_initiative/);
  assert.match(automaticSceneInitiative, /after insert on public\.tokens/);
  assert.match(automaticSceneInitiative, /on conflict \(scene_id, token_id\)/);
  assert.match(automaticSceneInitiative, /character_name \|\| ' ' \|\| character_sequence/);
  assert.match(automaticSceneInitiative, /if tg_op = 'INSERT'/);
  assert.match(
    sharedCharacterMacrosOnTokens,
    /create function public\.can_manage_character_macros/,
  );
  assert.match(
    sharedCharacterMacrosOnTokens,
    /public\.owns_character\(target_character_id\)/,
  );
  assert.match(
    sharedCharacterMacrosOnTokens,
    /token\.character_id = target_character_id/,
  );
  assert.match(
    sharedCharacterMacrosOnTokens,
    /public\.is_campaign_master/,
  );
  assert.match(
    sharedCharacterMacrosOnTokens,
    /public\.can_manage_character_macros\(character_id\)/,
  );
  assert.match(independentMapGridScale, /add column map_width_px integer/);
  assert.match(
    independentMapGridScale,
    /grid_columns \* grid_cell_px/,
  );
  assert.match(
    independentMapGridScale,
    /alter column map_width_px set not null/,
  );
  assert.match(campaignDiceRollLog, /create table public\.dice_roll_log/);
  assert.match(campaignDiceRollLog, /enable row level security/);
  assert.match(campaignDiceRollLog, /Members can read campaign dice rolls/);
  assert.match(campaignDiceRollLog, /Members can record their own dice rolls/);
  assert.match(
    campaignDiceRollLog,
    /roller_user_id = public\.current_firebase_uid\(\)/,
  );
  assert.match(campaignDiceRollLog, /grant select, insert/);
  assert.doesNotMatch(campaignDiceRollLog, /grant select, insert, update/);
  assert.match(
    campaignDiceRollLog,
    /alter publication supabase_realtime add table public\.dice_roll_log/,
  );
  assert.match(
    manualEqualInitiativeOrder,
    /create function public\.swap_equal_initiative_entries/,
  );
  assert.match(
    manualEqualInitiativeOrder,
    /first_entry\.initiative is distinct from second_entry\.initiative/,
  );
  assert.match(
    manualEqualInitiativeOrder,
    /public\.is_campaign_master/,
  );
  assert.match(
    manualEqualInitiativeOrder,
    /unique \(scene_id, sort_order\)/,
  );
  assert.match(
    manualEqualInitiativeOrder,
    /grant execute[\s\S]*swap_equal_initiative_entries/,
  );
});
