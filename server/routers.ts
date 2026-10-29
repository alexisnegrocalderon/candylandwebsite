import { MAX_AMBASSADOR_BUYER_DISCOUNT, effectiveBuyerDiscountPercent } from '../shared/ambassadorDiscount';
import { COOKIE_NAME, ONE_YEAR_MS, CAJA_COOKIE_NAME, CAJA_SESSION_MS, CAJA_DEVICE_COOKIE_NAME, ADMIN_NOTIFICATION_EMAIL } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { pushTitle } from "../shared/pushText";
import { sdk, ADMIN_LOCAL_OPEN_ID, VIEWER_LOCAL_OPEN_ID } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminReadProcedure, giftProcedure, partnerProcedure, operatorProcedure, supervisorProcedure, deviceProcedure, doorProcedure, kitchenProcedure, guardarropiaProcedure, barraProcedure, anyOperatorProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { teachFromOwner, listKnowledge, setKnowledgeStatus, updateKnowledgeText, deleteKnowledge } from "./agentLearning";
import { nanoid } from "nanoid";
import * as db from "./db";
import { getMission300Status, evaluateMission300, processCardPaymentForOrder, confirmFreeOrder, resendConfirmationEmail, approveMissionTopupWithoutPayment, settleUpgradeAndNotify, settleAddonAndNotify } from "./webhooks";
import { getPendingUpgradesByOrderIds, previewUpgrade, createUpgradeRequest, sendUpgradeRequestEmail, cancelUpgrade } from "./orderUpgrade";
import { getPendingAddonsByOrderIds, previewAddons, createAddonRequest, sendAddonRequestEmail, cancelAddon, orderIdFromTicketCode, customerAddonView } from "./orderAddon";
import { isValidRut, formatRutLive } from "../shared/rut";
import { hashPin, verifyPin, signOperatorSession } from "./caja/auth";
import { generateEnrollCode, enrollCodeExpiry, generateDeviceToken, hashDeviceToken, signDeviceSession, DEVICE_SESSION_MS } from "./caja/deviceAuth";
import { redeemDisplayCode } from "./caja/redeem";
import { undoRedeemDisplayCode } from "./caja/undoRedeem";
import { checkInTicket } from "./caja/checkin";
import { sellParkingAtDoor } from "./caja/parkingPaid";
import { MAX_TEST_GUESTS, MIN_TEST_GUESTS } from "../shared/playmatchTest";
import { UNDO_EXPENSE_WINDOW_MS } from "../shared/expenses";
import { canUseCaja, OPERATOR_ROLES, STAFF_SYSTEMS } from "../shared/cajaRoles";
import { STAFF_CARGO_KEYS } from "../shared/staffCargos";
import { applyInsumoSchema, applyManualSchema, applyStaffSchema, insumoSchemaStatus, manualSchemaStatus, staffSchemaStatus } from "./schemaUpdates";
import * as insumoSvc from "./insumos";
import { describirBotellas } from "../shared/insumos";
import { alertConteoDescuadre } from "./caja/alerts";
import { barraTareasDelEvento } from "./barraTareas";
import { barraConteoVentana } from "../shared/barraConteo";
import * as staffManualSvc from "./staffManuals";
import { recordDoorAlert } from "./caja/doorAlert";
import { DOOR_ALERT_COOLDOWN_MS, DOOR_ALERT_KEYS, DOOR_ALERT_NOTE_MAX } from "../shared/doorAlert";
import { MANUAL_LIMITS, isManualKey } from "../shared/staffManuals";
import * as solteros from "./solteros";
import { AVATARS_PER_GENDER, DEFAULT_LOOKING_FOR, LOOKING_FOR_KEYS, PAIR_TYPES, ORIENTATIONS, RELATION_STYLES, INTENTS, MAX_INTENTS, serializeIntents, parseIntents, MAX_PARTY_PHOTOS, MAX_REWINDS_PER_EVENT, PARTY_GENDERS, PARTY_ZONES, parseLookingFor, sanitizeCostume, serializeLookingFor, canPreRegister, partyEntryDenial, sanitizeAlias, sanitizeGiftMessage, sanitizeMessage, isPartyWindowOpen, validatePhotoBytes } from "../shared/party";
import * as ambassadorProgram from "./ambassadorProgram";
import * as playmatch from "./playmatchMarket";
import { PLAYMATCH_HOST_CARGO, publicPlaymatchConfig } from "../shared/playmatchMarket";
import { pautaAnimador } from "../shared/animadorPauta";
import { monthKeyFor } from "../shared/ambassadorProgram";
import { checkAndAdvanceTandaIfNeeded } from "./tandaAutoAdvance";
import { scanReceiptImage } from "./receiptScan";
import * as comprasSvc from "./compras";
import * as staffEntrySvc from "./staffEntry";
import { firmarDosier, dosierPath, DOSIER_TTL_ADMIN, DOSIER_TTL_CAJA } from "./dosierLink";
import { dosierFichas } from "./dosierData";
import { puedeVerDosier } from "../shared/staffPortal";
import { generateCostumeIdeas, fallbackResult as fallbackCostumeResult } from "./costumeOracle";
import { ORACLE_VIBES, ORACLE_COMPANY, ORACLE_LEVELS, ORACLE_SKIN, ORACLE_ITEMS, ORACLE_EXTRA_MAX } from "../shared/costumeOracle";
import * as applications from "./ambassadorApplications";
import * as birthdayApplications from "./birthdayApplications";
import * as homeSummary from "./homeSummary";
import * as birthdayProgram from "./birthdayProgram";
import * as eventBudget from "./eventBudget";
import {
  AMBASSADOR_REQUIREMENTS, AMBASSADOR_TASKS, instagramLinkFor, sanitizeApplicantName,
  sanitizeApplicationMessage, sanitizeFollowers, sanitizeInstagram, sanitizeWhatsapp, whatsappLinkFor,
} from "../shared/ambassadorApplication";
import { buildAmbassadorApplicationEmail, buildAmbassadorWelcomeEmail, buildApplicationReceivedEmail } from "./email";
import {
  BIRTHDAY_REQUIREMENTS, BIRTHDAY_WINDOW_DAYS, isBirthdayEligible,
  sanitizeApplicantName as sanitizeBirthdayName, sanitizeApplicationMessage as sanitizeBirthdayMessage,
  sanitizeBirthDate, sanitizeInstagram as sanitizeBirthdayInstagram, sanitizeWhatsapp as sanitizeBirthdayWhatsapp,
} from "../shared/birthdayApplication";
import { BIRTHDAY_TIERS } from "../shared/birthdayTiers";
import {
  buildBirthdayApplicationEmail, buildBirthdayApplicationReceivedEmail,
  buildBirthdayApprovedEmail, buildBirthdayTierUnlockedEmail,
} from "./email";

/** Puerta de entrada a "Caramelo": resuelve al que llama por su ticketCode
 * y revalida, en cada llamada, que entró de verdad por la puerta y que la
 * fiesta está abierta. Todos los endpoints de `party` pasan por acá. */
async function requirePartyActor(ticketCode: string) {
  const actor = await db.getPartyActor(ticketCode);
  const denial = partyEntryDenial(actor?.ticket, actor?.event, new Date());
  if (denial || !actor) {
    const message =
      denial === 'no_ingreso' ? 'Tu entrada todavía no fue escaneada en la puerta'
      : denial === 'fuera_de_horario' ? 'La fiesta no está abierta en este momento'
      : 'No encontramos tu entrada';
    throw new TRPCError({ code: 'FORBIDDEN', message });
  }
  return actor;
}

/** Quién puede entrar a la pantalla de anfitriones de Playmatch: quien tiene ese cargo en el Staff (y el dueño, para probarla),
 * con la fiesta de su próximo turno. */
async function playmatchHostAccess(email: string) {
  await staffPortal.ensureAdminStaffAccess(email);
  const staff = await staffPortal.findStaffByEmail(email);
  if (!staff || (staff.cargo !== PLAYMATCH_HOST_CARGO && !isAdminEmail(email))) return null;
  const eventId = await staffPortal.staffDosierEventId(staff.id);
  if (!eventId) return null;
  const event = await db.getEventById(eventId);
  return { staff, eventId, eventTitle: event?.title ?? '' };
}

/** Quién ve la pauta del animador: quien tiene el cargo «Animador / MC» en el Staff (y el dueño, para probarla).
 * No necesita turno ni evento: el mazo de dinámicas se puede revisar antes de la fiesta. */
async function animadorAccess(email: string) {
  await staffPortal.ensureAdminStaffAccess(email);
  const staff = await staffPortal.findStaffByEmail(email);
  if (!staff || (staff.cargo !== 'animador' && !isAdminEmail(email))) return null;
  return { staff };
}

/** Igual que la anterior, pero además exige tener el perfil creado. */
async function requirePartyProfile(ticketCode: string) {
  const actor = await requirePartyActor(ticketCode);
  if (!actor.profile) throw new TRPCError({ code: 'FORBIDDEN', message: 'Todavía no creaste tu perfil' });
  if (actor.profile.banned) throw new TRPCError({ code: 'FORBIDDEN', message: 'El equipo del local te sacó de Playmatch por esta noche' });
  // El administrador puede poner Playmatch en pausa en vivo: nadie desliza ni escribe hasta que lo reactive.
  if (!(await db.getPartyConfig(actor.event.id)).enabled) throw new TRPCError({ code: 'FORBIDDEN', message: 'Playmatch está en pausa por un momento. Vuelve en un rato.' });
  // Se inscribió antes de llegar: al pasar por la puerta su perfil aparece en la fiesta.
  if (!actor.profile.active) {
    await db.updatePartyProfile(actor.profile.id, { active: 1, lastSeenAt: new Date() });
    // Entra al juego: a quienes tienen mucha afinidad con esta persona les llega un aviso (sin decir quién es).
    if (actor.profile.swipeEnabled) void playmatch.notifyAffinityArrival(actor.profile.id);
    return { ...actor, profile: { ...actor.profile, active: 1 } };
  }
  return { ...actor, profile: actor.profile };
}

/** Para manejar las propias fotos: con el perfil creado, adentro o antes de la fiesta. */
async function requirePartyPhotoOwner(ticketCode: string) {
  const actor = await requirePartyRegistrant(ticketCode);
  if (!actor.profile) throw new TRPCError({ code: 'FORBIDDEN', message: 'Todavía no creaste tu perfil' });
  return { ...actor, profile: actor.profile };
}

/** Para inscribirse (o editar el perfil): adentro de la fiesta, o antes, con la entrada comprada
 * (`canPreRegister`). Devuelve también si ya puede entrar. */
async function requirePartyRegistrant(ticketCode: string) {
  const actor = await db.getPartyActor(ticketCode);
  const now = new Date();
  const inside = !partyEntryDenial(actor?.ticket, actor?.event, now);
  if (!actor || (!inside && !canPreRegister(actor.ticket, actor.event, now))) {
    throw new TRPCError({ code: 'FORBIDDEN', message: actor ? 'Esta fiesta ya terminó' : 'No encontramos tu entrada' });
  }
  if (actor.profile?.banned) throw new TRPCError({ code: 'FORBIDDEN', message: 'El equipo del local te sacó de Playmatch por esta noche' });
  return { ...actor, inside };
}
import { createCajaSale } from "./caja/sale";
import { friendlySyncErrorMessage } from "./caja/ops";
import { listKitchenTickets, updateKitchenTicket, listKitchenProducts, updateKitchenProductStock, toggleKitchenProductSoldOut } from "./kitchen";
import { listLockerItems, updateLockerItem } from "./locker";
import { voidTicketCode } from "./caja/void";
import { voidCajaSale } from "./caja/voidSale";
import { changeCustomerEmail, deleteCustomerProfile, getCustomerProfile, updateCustomerProfile } from "./customerProfile";
import { computeCustomerLevel } from "../shared/customerInsights";
import { checkSaleAlerts, alertSaleVoided, alertWrongAdminPassword, alertShiftClosed, listCajaAlerts } from "./caja/alerts";
import { BRAND } from "../shared/eventBrand";
import * as partnerSvc from "./partnerCampaigns";
import * as contestSvc from "./contests";
import * as rankingSvc from "./contestRanking";
import { fetchOwnMedia } from "./instagramSend";
import { normalizeMedia } from "../shared/instagramShowcase";
import * as staffSvc from "./staff";
import * as siiSvc from "./sii";
import * as cashSvc from "./cash";
import * as mpSync from "./mercadopagoSync";
import { getEventFinanceReport, getEventLive, getMarginTarget } from "./finance";
import { getCompanyYear, getPayables, markCommissionsPaid, resetCommissionPayments } from "./financeCompany";
import { askFinance, buildNightSummary, buildWeeklySummary } from "./financeDirector";
import { comparisonPdf as budgetComparisonPdf, singlePdf as budgetSinglePdf, loadSims as loadBudgetSims, slug as budgetSlug } from "./budgetReport";
import { compareSimulations, formatPercent } from "../shared/budgetInsights";
import { computeBudgetResult } from "../shared/eventBudget";
import { sendEmail, resendTagValue, buildShiftCloseEmail, buildMailingBlastEmail, buildKitchenVendorEmail, buildSimpleReportEmail, buildOrderEmail, buildMissionTopupEmail, buildPendingReminderEmail, buildGiftEmail, buildGiftDrinkEmail, buildTopupCodeEmail, buildPinChangedEmail, buildMemberCodeEmail } from "./email";
import { currentLoginCode, verifyLoginCode, signTopupSession, verifyTopupSession, normalizeEmail } from "./topupAccess";
import { identityFromTicketCode, identityFromEmail, getTopupOptions, createTopupOrder, resetCardPin, maskEmail, type TopupIdentity } from "./playcardTopup";
import { formatChileDate, formatChileTime } from "../shared/chileDate";
import { normalizeOrderEmailConfig, type OrderEmailConfig } from "../shared/emailTemplateConfig";
import { billingPeriodStart, RESEND_DAILY_DEFAULT, RESEND_MONTHLY_LIMIT } from "../shared/emailQuota";
import { applyEmailOptOut, decodeEmail as decodeUnsubscribeEmail, verifyUnsubscribe } from "./unsubscribe";
import { normalizeAdminAlertsConfig } from "../shared/adminAlertsConfig";
import * as customerPush from "./customerPush";
import { notifyEventLaunch } from "./customerPush";
import * as appDevices from "./appDevices";
import * as members from "./members";
import { getMemberEmail, setMemberSession, clearMemberSession, verifyMemberCode, normalizeMemberEmail, currentMemberCode } from "./memberAuth";
import { isAdminEmail, adminLoginCodeKey } from "./adminEmail";
import * as memberPasskeys from "./memberPasskeys";
import * as demoAccount from "./demoAccount";
import { normalizeMemberConfig } from "../shared/memberConfig";
import * as memberCards from "./memberCards";
import * as memberPay from "./memberPay";
import { isMemberEarlyAccess } from "../shared/memberConfig";
import { draftPushCopy } from "./pushAi";
import { normalizeCustomerPushConfig } from "../shared/customerPushConfig";
import { normalizeInstagramAgentConfig, normalizeIgUsername, DEFAULT_INSTAGRAM_AGENT_CONFIG, IG_MAX_REPLY_CHARS } from "../shared/instagramAgentConfig";
import { sendManualInstagramReply } from "./instagram";
import { canReplyWithinWindow, fetchOwnProfile } from "./instagramSend";
import { runInstagramAgent, buildInstagramContext } from "./instagramAgent";
import { getIgCustomerLinkState } from "./igCustomerLink";
import { AGENT_SITE_PAGES } from "./agentLinks";
import { generateReelScript } from "./reelScript";
import { generateProfileAudit } from "./profileAudit";
import { syncInstagramStats } from "./instagramStats";
import { getInstagramShowcase } from "./instagramFeed";
import { refundOrder } from "./orderRefund";
import { cancelGiftPass, issueAccessCreditsForOrder, issueGiftPass, listAccessCredits, listCreditsByOrderIds, listGiftPasses, remindAccessCredit } from "./accessCredit";
import { AUTOMATION_BUTTON_KINDS, AUTOMATION_BUTTON_TITLE_MAX, isAllowedCustomButtonUrl } from "../shared/automationButton";
import { normalizeIgHandle } from "../shared/igCustomerLink";
import { approveComment, restoreSpamComment, suggestOwnComment } from './instagramComments';
import * as coproductionSvc from './coproduction';
import { partnerOpenId, normalizeLanding } from '../shared/coproduction';
import type { Coproduction } from '../drizzle/schema';
import { getInstagramInsights } from './instagramInsights';
import { igReferralLabel, referralUtmContent } from '../shared/igReferral';
import { buildFunnel, normalizeLinkCode, postOrigin } from '../shared/igFunnel';
import { INSIGHT_TYPE_LABEL } from '../shared/instagramInsights';
import { runAgentCoach } from "./agentCoach";
import { runSalesStrategist, setSalesStrategyWeekly } from "./salesStrategist";
import { sendEventSurveys, sendSurveyTestEmail, analyzeEventSurvey, getEventSurveyPanel } from "./eventSurvey";
import { parseSurveyAnswer } from "../shared/eventSurvey";
import { getWinbackOverview, draftWinbackEmail, createWinbackCampaign } from "./winback";
import { WINBACK_SEGMENT_KEYS } from "../shared/winback";
import { generateContentPlan } from "./contentPlanner";
import { getStampCard, refreshStampsForTicket } from "./stampCard";
import { activatePlaymatchForTicket } from "./partyActivation";
import * as staffPortal from "./staffPortal";
import { ensureStaffSalesLink } from "./staffSales";
import { pageCustomers, findCustomersForCaja, quickSearchCustomers } from "./customerFilters";
import { COUPON_BATCH_MAX } from "../shared/couponGift";
import { canGift } from "../shared/gifts";
import { cleanGiftMessage, giftMessageData, GIFT_MESSAGE_MAX } from "../shared/giftFlow";
import { VETO_NOTE_MAX } from "../shared/veto";
import { PARTIAL_ITEM_MAX } from "../shared/locker";
import * as vetoSvc from "./veto";
import { STAFF_CALL_COOLDOWN_MS, STAFF_CALL_KEYS, STAFF_CALL_NOTE_MAX } from "../shared/staffCall";
import { callOrganizers, notifyOrganizers } from "./staffCall";
import { ANY_ACCESS_SLUG, giftPassError } from "../shared/accessCredit";
import { previewCustomerMerge, mergeCustomers } from "./customerMerge";
import { getMemberHistory } from "./memberHistory";
import { hasSalesLink } from "../shared/staffSales";
import { autoPackFromDesign, deleteAmbassadorItem, ensureAmbassadorDrafts, getUpcomingContentEvents, listAmbassadorItems, notifyAmbassadorsNewContent, saveAmbassadorItem, sendStudioToAmbassadors, setAmbassadorItemStatus } from "./ambassadorContent";
import { listContentDesigns, getContentDesign, saveContentDesign, deleteContentDesign, getContentVideo, saveContentVideo, listVideoStyles, saveVideoStyle, deleteVideoStyle } from "./contentStudio";
import { renderMissingConfig, requestVideoRender } from "./studioRender";
import { quickPhotoTexts, quickVideoFromIdea } from "./studioAi/quickIdea";
import { recordAiUsage, listAiUsageSince } from "./db";
import { summarizeAiUsage } from "../shared/aiUsage";
import { loadAiBudget, saveAiBudget } from "./aiBudget";
import { quickBubbleDesign } from "./studioAi/quick";
import { AI_MODELS } from "../shared/studioAi";
import { STUDIO_FORMATS } from "../shared/contentStudio";
import { listAiMessages, loadAiDesign, restoreAiVersion, saveSlideEdit, updateAiDesignMeta } from "./studioAi/store";
import { normalizeSalesStrategyState } from "../shared/salesStrategy";
import { normalizeAgentCoachReport } from "../shared/agentCoach";
import { normalizeWhatsAppAgentConfig, DEFAULT_WHATSAPP_AGENT_CONFIG, WA_MAX_REPLY_CHARS } from "../shared/whatsappAgentConfig";
import { sendManualWhatsAppReply } from "./whatsapp";
import { normalizeFlashPromoPresets } from "../shared/flashPromoPresets";
import { sendTestPushToAllAdmins, sendPushToAdmins, sendPushToAdminsAlways, sendPushToProfile, sendPushToEventGuests } from "./push";
import { runAdminDigest } from "./adminDigest";
import { buildShiftClosePdf } from "./caja/shiftReportPdf";
import { buildKitchenVendorPdf } from "./caja/kitchenVendorPdf";
import { buildVentasReportPdf, buildGastosReportPdf } from "./caja/reportsPdf";
import { generateMailingTemplate, sendMailingBatch, getMailingEventInfo, createAutoMailingCampaign, scheduleMailingCampaign, resolveAudienceCustomerIds, getCampaignOffer, AudienceFiltersSchema, MailingContentSchema, MAILING_BATCH_MAX } from "./mailing";
import { getFoundersPromoStatus, runFoundersPromoDaily, buildFoundersPromoContent } from "./foundersPromo";
import { listDriveMedia } from "./googleDrive";
import { getSalesDripStatus, runSalesDripDaily, buildSalesDripContent } from "./salesDrip";
import { resolveCurrentOffer } from "./tanda2Promo";
import { getTanda2PromoStatus, runTanda2PromoDaily, buildTanda2PromoContent } from "./tanda2Promo";
import { EMAIL_BASE_URL } from "./emailLayout";
import { sendPendingReminders, generateReminderCopy } from "./orderReminders";
import { generateEventDescription } from "./eventDescriptions";
import { generateAutomationReplyDraft } from "./instagramAutomationDraft";
import { answerSalesQuestion } from "./adminQa";
import { parseCsv, extractEmailColumn } from "./csv";
import QRCode from "qrcode";
import { consumeBackupCode, createTotpSecret, generateBackupCodes, parseBackupCodes, safeCompare, totpUri, verifyTotp } from "./adminSecurity";
import { ADMIN_WEBAUTHN_USER_ID_B64URL, ADMIN_WEBAUTHN_USER_NAME, ADMIN_WEBAUTHN_USER_DISPLAY_NAME, buildAuthenticationOptions, buildRegistrationOptions, getRpIdAndOrigin, verifyAuthentication, verifyRegistration } from "./webauthn";

const SHIFT_CLOSE_REPORT_EMAIL = ADMIN_NOTIFICATION_EMAIL;

/** "¿Quién factura este evento?" manda: `ivaApplies` (lo que usa el P&L) se
 * deriva de ahí para que nunca se contradigan. Los que no van en el F29
 * exigen una nota que explique por qué. */
function withTaxIssuer<T extends { taxIssuer?: string; taxNote?: string | null; ivaApplies?: number }>(data: T): T {
  if (!data.taxIssuer) return data;
  if ((data.taxIssuer === 'tercero' || data.taxIssuer === 'exento') && !data.taxNote?.trim()) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: data.taxIssuer === 'tercero' ? 'Indica quién factura este evento (el local u otro organizador).' : 'Indica por qué es exento (y quién lo confirmó).' });
  }
  // "Exento" es una condición legal, no una forma de tener más caja: se exige
  // que diga qué norma o qué contador lo respalda.
  if (data.taxIssuer === 'exento' && !/(art|ley|decreto|contador|resoluci|sii|cultural)/i.test(data.taxNote ?? '')) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Para marcarlo exento indica la norma (art./ley/resolución) o el contador que lo confirmó. Si las entradas se cobran por tu Mercado Pago, normalmente se declaran con IVA.' });
  }
  return { ...data, ivaApplies: data.taxIssuer === 'mansion' ? 1 : 0, taxNote: data.taxNote?.trim() || null };
}
const APPLICATIONS_EMAIL = ADMIN_NOTIFICATION_EMAIL;
const APPLICATION_MAX_PER_HOUR = 5;
const COSTUME_ORACLE_MAX_PER_HOUR = 8;
const COSTUME_ORACLE_MAX_PER_DAY = 1500;

// Datos ficticios para "mandar prueba" / vista previa de los correos de cara
// al cliente desde el admin -- nunca datos de una orden real.
const SAMPLE_ORDER_EMAIL_DATA = {
  buyerName: 'Camila',
  eventTitle: '2º Aniversario Mansion Playroom',
  eventDate: 'Viernes 30 de octubre, 2026',
  doorsOpenText: '23:00',
  venue: 'La Mansión',
  address: 'Valparaíso',
  mapsUrl: 'https://maps.google.com',
  orderNumber: 'MP-TEST123',
  items: [
    { name: 'Acceso Dúo', quantity: 1, price: 20000 },
    { name: 'Estacionamiento', quantity: 1, price: 3000 },
  ],
  total: 15100,
  discount: 9000,
  serviceFee: 2100,
  ambassadorCode: 'CAMI2026',
  isMissionDeposit: false,
  ticketReady: true,
  ticketCode: 'TICKET-ABC123',
  attendeeNames: ['Camila Fuentes', 'Jorge Alarcón'],
  extras: [{ name: 'Estacionamiento', quantity: 1, codes: ['PK-ABC1'] }],
};
const SAMPLE_MISSION_TOPUP_DATA = {
  buyerName: 'Camila',
  eventTitle: '2º Aniversario Mansion Playroom',
  eventDate: 'Viernes 30 de octubre, 2026',
  orderNumber: 'MP-TEST123',
  topupAmount: 8000,
  paymentUrl: 'https://mansionplayroom.cl',
};
const SAMPLE_PENDING_REMINDER_DATA = {
  buyerName: 'Camila',
  eventTitle: '2º Aniversario Mansion Playroom',
  eventDate: new Date(),
  total: 20000,
  checkoutUrl: 'https://mansionplayroom.cl',
};
const SAMPLE_GIFT_DATA = {
  toAlias: 'Duende Rosa',
  fromAlias: 'Zorro Plateado',
  drinkName: 'Piscola',
  displayCode: 'ABCD',
  message: '¡Disfrútalo!',
  eventTitle: '2º Aniversario Mansion Playroom',
};

/** La vista previa/"mandar prueba" de correos de cara al cliente usa datos
 * ficticios (arriba) para todo lo que es de la orden (comprador, ítems,
 * montos) -- pero fecha/hora/lugar del evento SÍ tienen un dato real
 * disponible, así que se reemplazan por los del evento destacado cuando
 * existe uno, para que la vista previa nunca muestre una hora vieja que ya
 * no coincide con lo cargado en Eventos. Mismo formateo que usa el envío
 * real de correos (server/webhooks.ts) vía shared/chileDate.ts. */
async function resolveOrderPreviewEventFields() {
  const event = await db.getFeaturedEvent();
  if (!event) return {};
  return {
    eventTitle: event.title,
    eventDate: formatChileDate(new Date(event.eventDate)),
    doorsOpenText: formatChileTime(new Date(event.doorsOpen ?? event.eventDate)),
    venue: event.venue || SAMPLE_ORDER_EMAIL_DATA.venue,
    address: event.address || SAMPLE_ORDER_EMAIL_DATA.address,
    mapsUrl: event.mapsUrl || SAMPLE_ORDER_EMAIL_DATA.mapsUrl,
  };
}

async function resolveMissionTopupPreviewEventFields() {
  const event = await db.getFeaturedEvent();
  if (!event) return {};
  return {
    eventTitle: event.title,
    eventDate: formatChileDate(new Date(event.eventDate)),
  };
}

// Escritura del panel: SOLO admin. El invitado de demostración (`viewer`)
// nunca pasa por acá -- las queries de lectura usan `adminReadProcedure`,
// importado de _core/trpc, que además le enmascara los datos personales.
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  return next({ ctx });
});

/** Acción destructiva del panel: exige la clave de admin EN CADA LLAMADA,
 * además de la sesión.
 *
 * `adminProcedure` solo mira una cookie que dura 7 días: el 2FA protege
 * ENTRAR al panel, no BORRAR. Con la sesión abierta en el teléfono, un toque
 * equivocado -- o cualquiera que agarre el aparato desbloqueado -- puede
 * borrar una compra, un evento o el historial de caja sin que nada lo frene.
 * El dueño pidió explícitamente que se pida la clave cada vez.
 *
 * El límite por IP es el mismo de los logins, y acá importa más: a
 * diferencia del login, este camino no tiene segundo factor, así que sin el
 * límite sería un oráculo cómodo para adivinar la clave a fuerza bruta. */
const adminPasswordInput = z.object({
  adminPassword: z.string().min(1, 'Ingresa tu clave de admin'),
});

/** Verifica la clave de admin (ADMIN_PASSWORD) con límite de intentos por
 * IP. La usan las acciones destructivas del panel y, desde /caja, la
 * anulación de ventas -- con un `keyPrefix` propio para que los intentos en
 * la tablet no bloqueen al panel ni al revés. Devuelve `false` en vez de
 * tirar cuando la clave es incorrecta, para que el llamador pueda avisar. */
async function checkAdminPassword(ctx: any, password: string | undefined, keyPrefix: string): Promise<boolean> {
  const ipKey = `${keyPrefix}:${clientIp(ctx)}`;
  if (!(await db.checkIpRateLimit(ipKey))) {
    throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Espera unos minutos.' });
  }
  if (password?.startsWith(FACEID_GRANT_PREFIX)) {
    if (await verifyFaceIdDeleteGrant(password.slice(FACEID_GRANT_PREFIX.length))) return true;
    await db.recordIpFailedAttempt(ipKey);
    return false;
  }
  const adminPassword = process.env.ADMIN_PASSWORD;
  // `safeCompare` y no `!==`: tiempo constante, mismo criterio que ya usa
  // el login de admin.
  if (!adminPassword || !password || !safeCompare(password, adminPassword)) {
    await db.recordIpFailedAttempt(ipKey);
    return false;
  }
  return true;
}

const adminPasswordProcedure = adminProcedure
  .input(adminPasswordInput)
  .use(async (opts) => {
    const parsed = adminPasswordInput.safeParse(await opts.getRawInput());
    if (!(await checkAdminPassword(opts.ctx, parsed.success ? parsed.data.adminPassword : undefined, 'admin-reauth'))) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Clave de admin incorrecta' });
    }

    return opts.next({ ctx: opts.ctx });
  });

// Qué bloques de la tarjeta de evento incluir en un mail de mailing masivo --
// mismo shape usado por mailing.renderPreview, mailing.sendBatch y
// mailing.createAutoCampaign (server/email.ts MailingEventSections).
const mailingEventSectionsSchema = z.object({
  banner: z.boolean(),
  details: z.boolean(),
  mission300: z.boolean(),
  venueGrid: z.boolean(),
});

// Alta/edición de un gasto. `netAmount`, `ivaAmount` y `periodMonth` NO están
// acá a propósito: los deriva el servidor del monto total y del tipo de
// documento (shared/expenses.ts). Lo único que se puede forzar a mano es el
// IVA de una factura, con ivaAmountOverride, para las que vienen redondeadas
// distinto por el proveedor.
const expenseInputSchema = z.object({
  scope: z.enum(['evento', 'general']),
  eventId: z.number().nullable().optional(),
  expenseDate: z.string(),
  category: z.enum([
    'decoracion', 'barra', 'merch', 'staff', 'produccion', 'arriendo',
    'marketing', 'transporte', 'suscripciones', 'comisiones', 'otros',
  ]),
  description: z.string().min(1).max(255),
  supplier: z.string().max(160).optional(),
  supplierRut: z.string().max(16).optional(),
  documentType: z.enum(['boleta', 'factura', 'boleta_honorarios', 'sin_documento']),
  documentNumber: z.string().max(32).optional(),
  ivaExempt: z.boolean().optional(),
  amountTotal: z.number().int().positive(),
  ivaAmountOverride: z.number().int().nonnegative().optional(),
  paymentMethod: z.enum(['efectivo', 'tarjeta', 'transferencia', 'otro']),
  paidFromShiftId: z.number().nullable().optional(),
  recurrence: z.enum(['none', 'mensual', 'por_evento']).optional(),
  recurrenceEndsAt: z.string().nullable().optional(),
  excludeFromPnl: z.boolean().optional(),
  prorate: z.boolean().optional(),
  receiptUrl: z.string().optional(),
  notes: z.string().max(500).optional(),
  slotKey: z.string().max(32).nullish(),
// Una plantilla 'por_evento' es el catálogo de un costo fijo de cada fiesta,
// no un gasto de una fiesta puntual: va con scope 'evento' pero SIN eventId,
// porque se copia a todas. Por eso queda exenta de la regla de abajo.
}).refine((v) => v.recurrence === 'por_evento' || v.scope !== 'evento' || !!v.eventId, {
  message: 'Un gasto de evento necesita que elijas a qué evento va',
  path: ['eventId'],
// Una suscripción se paga todos los meses; un evento pasa una vez. Cargar
// una suscripción a un evento hacía que `materializeRecurringExpenses` le
// creara una copia a ESA fiesta cada mes para siempre, así que su resultado
// seguía empeorando meses después de que terminó. Un costo que se repite
// todos los meses es de la productora; el que se repite en cada fiesta va con
// 'por_evento', que sí se carga completo a cada una.
}).refine((v) => v.recurrence !== 'mensual' || v.scope === 'general', {
  message: 'Un gasto que se repite todos los meses va a la productora. Si es un costo fijo de cada fiesta (el DJ, la seguridad), usa "se repite en cada evento".',
  path: ['recurrence'],
}).refine((v) => v.recurrence !== 'por_evento' || v.scope === 'evento', {
  message: 'Un costo fijo de cada fiesta se imputa a los eventos, no a la productora.',
  path: ['recurrence'],
}).refine((v) => v.recurrence !== 'por_evento' || !v.eventId, {
  message: 'Un costo fijo de cada fiesta no se carga a una fiesta puntual: se copia a todas automáticamente.',
  path: ['eventId'],
});

const budgetSimulationInputSchema = z.object({
  name: z.string().min(1).max(255),
  eventId: z.number().nullable().optional(),
  ivaApplies: z.boolean(),
  // Opcional para no romper un panel abierto con la versión anterior.
  onlineSalesNoIva: z.boolean().default(false),
  marginTargetPercent: z.number(),
  cardFeePercent: z.number().min(0).max(100),
  commissionPercent: z.number().min(0).max(100),
  variableCostPerPerson: z.number().nonnegative(),
  otherRevenuePerPerson: z.number().nonnegative(),
  // Opcional para no romper un panel abierto con la versión anterior.
  venueBarSharePercent: z.number().min(0).max(100).default(0),
  // Ingresos adicionales sin personas (estacionamiento): opcional para no
  // romper un panel abierto con la versión anterior.
  extraIncomes: z.array(z.object({
    label: z.string().min(1),
    unitPrice: z.number().nonnegative(),
    quantity: z.number().int().nonnegative(),
    venueCostPerUnit: z.number().nonnegative().optional(),
  })).default([]),
  revenueTiers: z.array(z.object({
    label: z.string().min(1),
    price: z.number().nonnegative(),
    expectedQty: z.number().int().nonnegative(),
    personasPorEntrada: z.number().int().positive(),
  })),
  expenseLines: z.array(z.object({
    category: z.string(),
    label: z.string().min(1),
    amount: z.number().nonnegative(),
    // Sin esto zod descarta el campo y todo "+ IVA" se guardaría como incluido.
    ivaMode: z.enum(['incluido', 'mas_iva']).optional(),
  })),
  notes: z.string().optional(),
});


/** Verifica el PIN de un operador aplicando los dos límites que ya existen:
 * por IP (para que nadie enumere operadores probando pocos intentos en cada
 * uno) y por operador (5 fallos lo bloquean 5 minutos). Lo comparten el
 * login de /caja y el de /puerta -- una sola implementación para que un
 * arreglo de seguridad no se aplique en un lado y se olvide en el otro. */
async function verifyOperatorPinOrThrow(ctx: any, operatorId: number, pin: string) {
  const forwardedFor = ctx.req.headers['x-forwarded-for'];
  const clientIp = (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : forwardedFor?.[0]) || ctx.req.socket.remoteAddress || 'unknown';
  const ipKey = `pin-login:${clientIp}`;
  if (!(await db.checkIpRateLimit(ipKey))) {
    throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos desde este dispositivo. Intenta de nuevo más tarde.' });
  }

  const operator = await db.getOperatorById(operatorId);
  if (!operator || !operator.active) {
    await db.recordIpFailedAttempt(ipKey);
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'PIN incorrecto' });
  }

  if (operator.lockedUntil && new Date(operator.lockedUntil).getTime() > Date.now()) {
    const minutesLeft = Math.ceil((new Date(operator.lockedUntil).getTime() - Date.now()) / 60_000);
    throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: `Demasiados intentos. Intenta de nuevo en ${minutesLeft} min.` });
  }

  if (!verifyPin(pin, operator.pinHash)) {
    await db.recordFailedPinAttempt(operator.id);
    await db.recordIpFailedAttempt(ipKey);
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'PIN incorrecto' });
  }

  await db.resetPinAttempts(operator.id);
  return operator;
}

/** PIN de las pantallas sin dispositivo enrolado (puerta, cocina, guardarropía): el rol tiene que ser
 * de esa pantalla (shared/cajaRoles.ts STAFF_SYSTEMS) y el operador del evento de esta noche (el mismo
 * que lista `listOperators`) o del de pruebas -- igual que la caja exige el evento de su dispositivo. */
async function verifyScreenPinOrThrow(ctx: any, operatorId: number, pin: string, screen: 'puerta' | 'cocina' | 'guardarropia' | 'barra') {
  const operator = await verifyOperatorPinOrThrow(ctx, operatorId, pin);
  const system = STAFF_SYSTEMS.find((x) => x.key === screen)!;
  if (!(system.roles as readonly string[]).includes(operator.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: `Tu usuario no trabaja en ${system.label.toLowerCase()}` });
  }
  const active = await db.getActiveEventForCaja();
  if (operator.eventId !== active?.id) {
    const test = await db.getEventBySlug('pruebas-caja');
    if (operator.eventId !== test?.id) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Tu acceso es de otro evento: pide que te asignen a esta noche' });
  }
  return operator;
}

const verifyDoorPinOrThrow = (ctx: any, operatorId: number, pin: string) => verifyScreenPinOrThrow(ctx, operatorId, pin, 'puerta');
const verifyKitchenPinOrThrow = (ctx: any, operatorId: number, pin: string) => verifyScreenPinOrThrow(ctx, operatorId, pin, 'cocina');
const verifyGuardarropiaPinOrThrow = (ctx: any, operatorId: number, pin: string) => verifyScreenPinOrThrow(ctx, operatorId, pin, 'guardarropia');
const verifyBarraPinOrThrow = (ctx: any, operatorId: number, pin: string) => verifyScreenPinOrThrow(ctx, operatorId, pin, 'barra');


/** Clave de límite por IP del panel de administración, separada de la del
 * PIN de caja para que un ataque a uno no bloquee al otro. */
function adminIpKey(ctx: any): string {
  const forwardedFor = ctx.req.headers['x-forwarded-for'];
  const ip = (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : forwardedFor?.[0]) || ctx.req.socket.remoteAddress || 'unknown';
  return `admin-login:${ip}`;
}

/** IP del cliente, misma extracción que ya usan adminIpKey y
 * verifyOperatorPinOrThrow, pero sin el prefijo -- cada llamador arma su
 * propia clave de rate limit. */
function clientIp(ctx: any): string {
  const forwardedFor = ctx.req.headers['x-forwarded-for'];
  return (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : forwardedFor?.[0]) || ctx.req.socket.remoteAddress || 'unknown';
}

/** Los errores de "pasar a Trío" ya vienen redactados en español para el
 * admin (orden bloqueada, falta cupo, falta la migración...): se devuelven
 * tal cual como BAD_REQUEST en vez de un error interno genérico. */
async function upgradeErrorsAsBadRequest<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({ code: 'BAD_REQUEST', message: error instanceof Error ? error.message : 'No se pudo completar la operación.' });
  }
}

/** Quién recarga la PlayCard: el dueño de un ticket (link de la tarjeta
 * digital) o el correo ya validado con el código (sesión firmada). */
async function resolveTopupIdentity(input: { ticketCode?: string; sessionToken?: string; member?: boolean }, req?: Parameters<typeof getMemberEmail>[0]): Promise<TopupIdentity> {
  let identity: TopupIdentity | null = null;
  if (input.member && req) {
    // Desde «Mi cuenta»: la sesión del socio ya probó el correo (con el interruptor accountTopup prendido).
    const email = getMemberEmail(req);
    if (email && (await members.getMemberConfig()).payments.accountTopup) identity = await identityFromEmail(email);
  } else if (input.ticketCode) {
    identity = await identityFromTicketCode(input.ticketCode);
  } else if (input.sessionToken) {
    const email = verifyTopupSession(input.sessionToken);
    if (email) identity = await identityFromEmail(email);
  }
  if (!identity) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Tu sesión venció -- pide tu código de nuevo.' });
  }
  return identity;
}

/** Vale de corta vida que acredita haber pasado el primer paso (la
 * contraseña). Va firmado y dura 5 minutos: sin él, el segundo paso
 * tendría que confiar en la palabra del cliente. */
async function signAdminStepTicket(): Promise<string> {
  return sdk.signSession({ openId: `${ADMIN_LOCAL_OPEN_ID}:step1`, appId: 'candyland-admin-2fa', name: 'step1' }, { expiresInMs: 5 * 60 * 1000 });
}

async function requireAdminStepTicket(ticket: string) {
  try {
    const payload = await sdk.verifySession(ticket);
    if (payload?.openId !== `${ADMIN_LOCAL_OPEN_ID}:step1`) throw new Error('bad ticket');
  } catch {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Vuelve a ingresar tu contraseña' });
  }
}

/** Vale del paso 1 para quien entró con su correo (ADMIN_EMAILS). Solo si el segundo factor YA está
 * configurado: el correo nunca sirve para enrolarlo (eso se hace una vez entrando con la contraseña), y la
 * válvula ADMIN_2FA_DISABLED tampoco aplica acá. */
async function adminStepTicketForEmail(): Promise<string> {
  const totp = await db.getAdminTotp();
  if (!totp?.confirmedAt) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Primero configura el segundo factor entrando una vez con tu contraseña.' });
  }
  return signAdminStepTicket();
}

/** Vale de corta vida para una ceremonia WebAuthn (registro o login de
 * passkey): el "challenge" viaja adentro, firmado, en vez de guardarse en el
 * servidor -- mismo criterio que signAdminStepTicket para el paso 1 de TOTP.
 * Dura 2 minutos: alcanza de sobra para completar el prompt de Face
 * ID/Touch ID, y no vale la pena dejarlo vivo más que eso. */
async function signWebauthnTicket(kind: 'reg' | 'auth' | 'reauth', challenge: string): Promise<string> {
  return sdk.signSession({ openId: `webauthn:${kind}`, appId: 'candyland-admin-webauthn', name: challenge }, { expiresInMs: 2 * 60 * 1000 });
}

async function requireWebauthnTicket(kind: 'reg' | 'auth' | 'reauth', ticket: string): Promise<string> {
  const payload = await sdk.verifySession(ticket).catch(() => null);
  if (payload?.openId !== `webauthn:${kind}`) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'El código expiró, intenta de nuevo.' });
  }
  return payload.name;
}

/** Borrar con Face ID en vez de la clave de admin: después de verificar el
 * passkey (`auth.webauthnReauthVerify`) el servidor entrega este permiso
 * firmado, y el cliente lo manda en el MISMO campo `adminPassword` de
 * siempre con el prefijo `faceid:` -- así las ~26 acciones protegidas no
 * cambian su input. Dura 60 s: alcanza para la mutación que sigue al
 * prompt, no para guardarlo. `checkAdminPassword` lo acepta como si fuera
 * la clave. El `openId` propio impide pasar acá la cookie de sesión u otro
 * vale firmado con el mismo secreto. */
const FACEID_GRANT_PREFIX = 'faceid:';
const FACEID_GRANT_OPEN_ID = 'webauthn:delete-grant';

async function signFaceIdDeleteGrant(): Promise<string> {
  const token = await sdk.signSession({ openId: FACEID_GRANT_OPEN_ID, appId: 'candyland-admin-webauthn', name: 'delete' }, { expiresInMs: 60 * 1000 });
  return `${FACEID_GRANT_PREFIX}${token}`;
}

async function verifyFaceIdDeleteGrant(token: string): Promise<boolean> {
  const payload = await sdk.verifySession(token).catch(() => null);
  return payload?.openId === FACEID_GRANT_OPEN_ID;
}

/** Verifica una respuesta de passkey contra las llaves registradas del
 * dueño. Compartido por el login con Face ID y la re-verificación para
 * borrar. Tira TRPCError si no pasa; los intentos fallidos cuentan para el
 * límite por IP de `ipKey`. */
async function verifyAdminPasskey(ctx: any, params: { kind: 'auth' | 'reauth'; ticket: string; response: any; ipKey: string }) {
  const { ipKey } = params;
  if (!(await db.checkIpRateLimit(ipKey))) {
    throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Espera unos minutos.' });
  }
  const challenge = await requireWebauthnTicket(params.kind, params.ticket);

  const credentialId: string | undefined = typeof params.response?.id === 'string' ? params.response.id : undefined;
  const credentialRow = credentialId ? await db.getAdminWebauthnCredentialById(credentialId) : null;
  const { rpID, origin } = getRpIdAndOrigin(ctx.req);
  if (!credentialRow) {
    // No cuenta como intento fallido: con el Face ID automático, una llave
    // vieja del llavero no debe dejar al dueño sin poder usar la contraseña.
    console.warn(`[webauthn] ${params.kind} fallido: llave no registrada`, { credentialId: credentialId?.slice(0, 12), origin, rpID });
    // `UNKNOWN_CREDENTIAL:<id>` le permite al cliente avisarle al
    // llavero que esa llave ya no sirve (Signal API) y que iOS la quite.
    throw new TRPCError({ code: 'UNAUTHORIZED', message: `UNKNOWN_CREDENTIAL:${credentialId ?? ''}` });
  }

  let verification;
  try {
    verification = await verifyAuthentication({
      response: params.response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: credentialRow.credentialId,
        publicKey: new Uint8Array(Buffer.from(credentialRow.publicKey, 'base64url')),
        counter: credentialRow.counter,
        transports: (credentialRow.transports as any) ?? undefined,
      },
    });
  } catch (err) {
    console.warn(`[webauthn] ${params.kind} fallido: verificación rechazada`, {
      credentialId: credentialId?.slice(0, 12), origin, rpID, reason: err instanceof Error ? err.message : String(err),
    });
    await db.recordIpFailedAttempt(ipKey);
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'No se pudo verificar tu identidad. Intenta de nuevo o usa la contraseña.' });
  }
  if (!verification.verified) {
    console.warn(`[webauthn] ${params.kind} fallido: firma no verificada`, { credentialId: credentialId?.slice(0, 12), origin, rpID });
    await db.recordIpFailedAttempt(ipKey);
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'No se pudo verificar tu identidad.' });
  }

  await db.touchAdminWebauthnCredential(credentialRow.id, verification.authenticationInfo.newCounter);
  await db.resetIpRateLimit(ipKey);
}

/** La sesión de admin baja de UN AÑO a 7 días. Un año era demasiado para
 * el panel que puede borrarlo todo, y con segundo factor volver a entrar
 * cuesta diez segundos. */
const ADMIN_SESSION_MS = 7 * 24 * 60 * 60 * 1000;

/** El invitado de demostración dura mucho menos que el admin: es una
 * credencial que se comparte en una reunión, no la sesión del dueño. */
const VIEWER_SESSION_MS = 8 * 60 * 60 * 1000;

async function issueViewerSession(ctx: any) {
  // A diferencia del admin, acá NO se hace upsertUser: el invitado es un
  // usuario totalmente sintético (ver sdk.authenticateRequest), así que no
  // ensucia la tabla `users` ni necesita el rol en la base.
  const sessionToken = await sdk.signSession(
    { openId: VIEWER_LOCAL_OPEN_ID, appId: 'candyland-admin', name: 'Invitado (demo)' },
    { expiresInMs: VIEWER_SESSION_MS },
  );
  const cookieOptions = getSessionCookieOptions(ctx.req);
  ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: VIEWER_SESSION_MS });
}

/** Vale del paso 2 del login del socio: lleva la co-producción y la versión
 * de sesión, así una clave cambiada a mitad del login no sirve. */
async function signPartnerStepTicket(cp: Coproduction): Promise<string> {
  return sdk.signSession({ openId: `partner-step:${cp.slug}:${cp.sessionVersion}`, appId: 'candyland-admin-2fa', name: 'partner-step1' }, { expiresInMs: 5 * 60 * 1000 });
}

async function requirePartnerStepTicket(ticket: string): Promise<Coproduction> {
  const payload = await sdk.verifySession(ticket).catch(() => null);
  const m = /^partner-step:([a-z0-9-]{1,50}):(\d+)$/.exec(payload?.openId ?? '');
  const cp = m ? await coproductionSvc.getCoproductionBySlug(m[1]) : null;
  if (!m || !cp || !cp.passwordHash || cp.sessionVersion !== Number(m[2])) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Vuelve a ingresar tu contraseña' });
  }
  return cp;
}

async function issuePartnerSession(ctx: any, cp: Coproduction) {
  const sessionToken = await sdk.signSession(
    { openId: partnerOpenId(cp.slug, cp.sessionVersion), appId: 'candyland-admin', name: cp.partnerName },
    { expiresInMs: ADMIN_SESSION_MS },
  );
  const cookieOptions = getSessionCookieOptions(ctx.req);
  ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ADMIN_SESSION_MS });
}

async function issueAdminSession(ctx: any) {
  await db.upsertUser({ openId: ADMIN_LOCAL_OPEN_ID, name: 'Admin', role: 'admin', lastSignedIn: new Date() });
  const sessionToken = await sdk.signSession({ openId: ADMIN_LOCAL_OPEN_ID, appId: 'candyland-admin', name: 'Admin' }, { expiresInMs: ADMIN_SESSION_MS });
  const cookieOptions = getSessionCookieOptions(ctx.req);
  ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ADMIN_SESSION_MS });
}

/* Botón debajo del mensaje de una automatización: valida que lo elegido sea
 * usable (página de la lista cerrada, link https del propio sitio). */
const automationButtonSchema = z.object({
  buttonKind: z.enum(AUTOMATION_BUTTON_KINDS),
  buttonTarget: z.string().max(300).nullable().optional(),
  buttonTitle: z.string().trim().max(AUTOMATION_BUTTON_TITLE_MAX).nullable().optional(),
}).transform((b, ctx) => {
  const target = b.buttonTarget?.trim() || null;
  if (b.buttonKind === 'page' && !AGENT_SITE_PAGES.some((p) => p.path === target)) {
    ctx.addIssue({ code: 'custom', message: 'Elige una página de la lista.' });
  }
  if (b.buttonKind === 'custom' && !(target && isAllowedCustomButtonUrl(target, new URL(process.env.APP_URL || 'https://mansionplayroom.cl').hostname))) {
    ctx.addIssue({ code: 'custom', message: 'El link propio tiene que ser https y de mansionplayroom.cl.' });
  }
  return {
    buttonKind: b.buttonKind,
    buttonTarget: b.buttonKind === 'page' || b.buttonKind === 'custom' ? target : null,
    buttonTitle: b.buttonKind === 'none' ? null : (b.buttonTitle?.trim() || null),
  };
});

/* ── Co-producción: alcance ─────────────────────────────────────────────── */
const coproductionScopeBase = z.object({ slug: z.string().max(50).optional() });
const coproductionScopeInput = coproductionScopeBase.optional().default({});

async function requireCoproduction(slug: string): Promise<Coproduction> {
  const cp = await coproductionSvc.getCoproductionBySlug(slug);
  if (!cp) throw new TRPCError({ code: 'NOT_FOUND', message: 'Co-producción no encontrada (¿falta aplicar la migración 0108?)' });
  return cp;
}

/** El socio SIEMPRE obtiene su propia co-producción (de la sesión); el slug
 * del input solo lo puede elegir el dueño. */
async function scopedCoproduction(ctx: { partnerCoproductionId: number | null }, input: { slug?: string } | undefined): Promise<Coproduction> {
  if (ctx.partnerCoproductionId != null) {
    const cp = await coproductionSvc.getCoproductionById(ctx.partnerCoproductionId);
    if (!cp) throw new TRPCError({ code: 'FORBIDDEN', message: 'Tu acceso ya no está activo.' });
    return cp;
  }
  return requireCoproduction(input?.slug ?? 'dalmore');
}

const blockedInputSchema = z.object({
  fullName: z.string().max(255).nullish(), rut: z.string().max(20).nullish(), email: z.string().max(320).nullish(),
  phone: z.string().max(40).nullish(), instagram: z.string().max(100).nullish(), reason: z.string().max(500).nullish(),
  sourceVenue: z.string().max(120).nullish(), sourceProducer: z.string().max(120).nullish(), blockedOn: z.string().max(10).nullish(),
  sourceBy: z.string().max(120).nullish(), notes: z.string().max(4000).nullish(), isActive: z.number().optional(),
});

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(512),
  keys: z.object({ p256dh: z.string().max(255), auth: z.string().max(255) }),
});
// La forma real la valida normalizeSegment (shared/pushSegments.ts): acepta reglas combinadas y las formas antiguas.
const pushSegmentSchema = z.record(z.string(), z.any());
const pushCampaignSchema = z.object({
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(255),
  url: z.string().trim().max(500),
  imageUrl: z.string().url().max(500).nullish(),
  segment: pushSegmentSchema,
  scheduledAt: z.string().datetime().nullish(),
  titleB: z.string().trim().max(80).nullish(),
  bodyB: z.string().trim().max(255).nullish(),
  abPercent: z.number().int().min(0).max(50).optional(),
  abWaitMin: z.number().int().min(30).max(1440).optional(),
  smartHour: z.boolean().optional(),
  actions: z.array(z.object({ label: z.string().trim().max(24), url: z.string().trim().max(500) })).max(2).optional(),
});

/** Correo de la sesión de «Mi cuenta» o error 401 (para las acciones del socio). */
/** Órdenes del checkout web (`attendeeData` con `campos`): tienen que traer la confirmación +18. Otras (sin `campos`) no aplican. */
export function checkoutConfirmedAdult(attendeeData: string | undefined | null): boolean {
  if (!attendeeData) return true;
  try {
    const parsed = JSON.parse(attendeeData);
    if (!parsed || typeof parsed !== 'object' || !parsed.campos || typeof parsed.campos !== 'object') return true;
    return parsed.campos.buyer__mayorEdad === true;
  } catch {
    return true;
  }
}

function requireMemberEmail(req: Parameters<typeof getMemberEmail>[0]): string {
  const email = getMemberEmail(req);
  if (!email) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Entra a tu cuenta para continuar.' });
  return email;
}

/** Filtros de la base de clientes (Clientes, audiencias de mailing). */
const customerFiltersInput = z.object({
  search: z.string().optional(),
  accessType: z.string().optional(),
  tag: z.string().optional(),
  excludeTags: z.array(z.string()).optional(),
  eventId: z.number().optional(),
  // Ya lo usaba internamente Founders Promo (server/foundersPromo.ts) --
  // se expone acá para poder armar audiencias de mailing manual tipo
  // "todos menos los que ya compraron este evento".
  notPurchasedEventId: z.number().optional(),
  // Audiencia de correos masivos: deja afuera a quien pidió la baja.
  forMailing: z.boolean().optional(),
  // Filtros de la ficha de cliente.
  level: z.enum(['sin_compras', 'nuevo', 'recurrente', 'vip', 'inactivo']).optional(),
  city: z.string().optional(),
  gender: z.string().optional(),
  source: z.string().optional(),
  birthdayMonth: z.number().int().min(1).max(12).optional(),
  optedOut: z.enum(['email', 'any']).optional(),
  // Solo quienes abrieron la app instalada en los últimos 60 días.
  hasApp: z.boolean().optional(),
});

/** Nunca sale el hash del PIN de la tarjeta; el nivel va calculado y `hasApp` dice si abrió la app hace poco. */
function decorateCustomers(rows: any[], withApp: Set<string>, now: Date) {
  return rows.map(({ cardPinHash: _hash, ...c }: any) => ({
    ...c,
    hasApp: withApp.has(c.email.toLowerCase()),
    level: computeCustomerLevel({
      totalOrders: c.totalOrders, totalSpent: Number(c.totalSpent), lastActivityAt: c.lastSeenAt, levelOverride: c.levelOverride, now,
    }),
  }));
}

async function customerRows(input: z.infer<typeof customerFiltersInput>) {
  const now = new Date();
  const { hasApp, ...filters } = input;
  const [all, withApp] = await Promise.all([db.listCustomers(filters), appDevices.appUserEmails()]);
  const rows = hasApp ? all.filter((c: any) => withApp.has(c.email.toLowerCase())) : all;
  return decorateCustomers(rows, withApp, now);
}

/** Regalo de cupón desde el panel (sección App): ver shared/couponGift.ts. */
const couponGiftInput = {
  type: z.enum(['percentage', 'fixed']),
  value: z.number().int().min(1).max(1_000_000),
  days: z.number().int().min(1).max(365),
  title: z.string().max(100).optional(),
  eventId: z.number().int().nullable().optional(),
  notify: z.boolean(),
};
const couponAudienceInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('emails'), emails: z.array(z.string().max(200)).min(1).max(COUPON_BATCH_MAX) }),
  z.object({ kind: z.literal('level'), level: z.enum(['vip', 'recurrente', 'nuevo', 'inactivo']) }),
  z.object({ kind: z.literal('birthdayMonth'), month: z.number().int().min(1).max(12) }),
  z.object({ kind: z.literal('app') }),
  z.object({ kind: z.literal('members') }),
]);

/** Crea los regalos de uno o varios correos: lo de acceso/extra va como invitación gratis (correo con QR), los tragos
 * de la carta quedan con su código canjeable en la barra, y a cada persona le llega un aviso a la app. Todo queda en la
 * auditoría con quién lo regaló. */
async function runGift(params: {
  eventId: number; emails: string[]; items: { ticketTypeId: number; quantity: number }[]; reason?: string; actor: string; ip?: string | null;
  /** `pase`: los accesos no llegan como entrada sino como pase en Cupones, que la persona canjea en el checkout. */
  mode?: 'directo' | 'pase';
  /** Pase «a elección»: la persona escoge su acceso al canjear (en vez del acceso fijo elegido). */
  anyAccess?: boolean;
  /** Días de vigencia del pase; `null` = hasta que termine el evento. */
  validDays?: number | null;
  /** Mensaje personalizado para quien lo recibe (correo y tarjeta de Cupones). */
  message?: string | null;
}) {
  const event = await db.getEventById(params.eventId);
  if (!event) throw new TRPCError({ code: 'NOT_FOUND', message: 'Evento no encontrado' });
  const types = await db.getTicketTypesByEventId(event.id);
  const byId = new Map<number, any>((types as any[]).map((t) => [t.id, t]));
  for (const it of params.items) if (!byId.has(it.ticketTypeId)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Un producto ya no existe en este evento' });
  const message = cleanGiftMessage(params.message);
  const asPass = params.mode === 'pase';
  const passItems = asPass ? params.items.filter((it) => byId.get(it.ticketTypeId).category === 'acceso') : [];
  const toOrder = params.items.filter((it) => ['acceso', 'extra'].includes(byId.get(it.ticketTypeId).category) && !passItems.includes(it));
  const comps = params.items.filter((it) => !['acceso', 'extra'].includes(byId.get(it.ticketTypeId).category));
  const eventEnd = (event as any).eventEnd ? new Date((event as any).eventEnd) : new Date(new Date(event.eventDate).getTime() + 12 * 3_600_000);
  const validUntil = params.validDays ? new Date(Date.now() + params.validDays * 86_400_000) : eventEnd;
  const resumen = params.items.map((it) => `${it.quantity > 1 ? `${it.quantity} × ` : ''}${byId.get(it.ticketTypeId).name}`).join(', ');
  const results: { email: string; ok: boolean; error?: string }[] = [];
  for (const raw of params.emails) {
    const email = raw.trim().toLowerCase();
    try {
      const staff = await staffPortal.findStaffByEmail(email);
      const customer = staff ? null : await db.getCustomerByEmail(email);
      const name = staff?.name ?? customer?.fullName ?? email.split('@')[0];
      if (toOrder.length > 0) {
        const r = await db.createManualOrder({ eventSlug: event.slug, buyerName: name, buyerEmail: email, items: toOrder, kind: 'invitation', attendeeData: giftMessageData(message) });
        await confirmFreeOrder(r.orderNumber);
      }
      for (const it of passItems) {
        for (let i = 0; i < it.quantity; i++) {
          await issueGiftPass({
            email, name, eventId: event.id, accesoSlug: params.anyAccess ? ANY_ACCESS_SLUG : (byId.get(it.ticketTypeId).accesoSlug ?? ANY_ACCESS_SLUG),
            validUntil, reason: params.reason ?? null, actor: params.actor, ip: params.ip ?? null, message,
          });
        }
      }
      for (const c of comps) await db.createStaffComp({ eventSlug: event.slug, ticketTypeId: c.ticketTypeId, quantity: c.quantity, staffName: name, buyerEmail: email, giftMessage: message });
      // Los tragos regalados no tenían correo: ahora llega uno con el mensaje y el botón a sus Cupones.
      if (comps.length > 0) {
        void sendEmail({
          to: email, subject: `🎁 Te regalaron algo para ${event.title}`,
          html: buildGiftDrinkEmail({ buyerName: name, eventTitle: event.title, items: comps.map((c) => ({ name: byId.get(c.ticketTypeId).name, quantity: c.quantity })), url: `${EMAIL_BASE_URL}/cuenta`, message }),
        }).catch((err) => console.error('[regalos] correo del trago:', err));
      }
      void customerPush.pushToEmail(email, { title: '🎁 ¡Te regalaron algo!', body: message ? `${resumen}. «${message.slice(0, 60)}${message.length > 60 ? '…' : ''}»` : `${resumen}. Míralo en tu app, en ${passItems.length || comps.length ? 'Cupones' : '«Mis entradas»'}.`, url: '/cuenta' });
      results.push({ email, ok: true });
    } catch (e) {
      results.push({ email, ok: false, error: e instanceof Error ? e.message : 'No se pudo regalar' });
    }
  }
  await db.recordAdminAudit({
    action: 'orders.gift', targetType: 'event', targetId: event.id, eventId: event.id, ip: params.ip ?? null,
    payload: { by: params.actor, reason: params.reason ?? null, resumen, items: params.items, results },
  });
  return { results, resumen };
}

export const appRouter = router({
  // Cuenta de prueba de la App (admin → Noche → «Cuenta de prueba»): server/demoAccount.ts.
  demoAccount: router({
    status: adminReadProcedure.query(async () => demoAccount.getDemoStatus()),
    create: adminProcedure.input(z.object({ email: z.string().email().max(200), name: z.string().max(80) })).mutation(async ({ input }) => {
      try {
        return await demoAccount.createDemoAccount(input);
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo crear la cuenta de prueba' });
      }
    }),
    setPhase: adminProcedure.input(z.object({ phase: z.enum(['antes', 'durante']) })).mutation(async ({ input }) => {
      try {
        return await demoAccount.setDemoPhase(input.phase);
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo cambiar la fiesta de prueba' });
      }
    }),
    delete: adminProcedure.mutation(async () => demoAccount.deleteDemoAccount()),
  }),
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    // Login simple por contraseña para el panel admin — no depende de ningún
    // OAuth externo, solo de la variable de entorno ADMIN_PASSWORD.
    // Paso 1 de 2: la contraseña NO entrega sesión por sí sola. Antes
    // este endpoint firmaba la cookie de una, sin ningún límite de
    // intentos -- un script podía probar miles de contraseñas por minuto
    // contra el panel que puede borrar compras y exportar la base entera.
    adminLogin: publicProcedure.input(z.object({ password: z.string() })).mutation(async ({ input, ctx }) => {
      const ipKey = adminIpKey(ctx);
      if (!(await db.checkIpRateLimit(ipKey))) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Espera unos minutos.' });
      }

      const adminPassword = process.env.ADMIN_PASSWORD;
      if (!adminPassword || !safeCompare(input.password, adminPassword)) {
        // Acceso de demostración de solo lectura: una segunda contraseña que
        // entra sin 2FA (se comparte en vivo en una reunión) pero que no
        // puede escribir nada y ve los datos personales enmascarados. Se
        // revoca borrando la variable en Vercel.
        const viewerPassword = process.env.ADMIN_VIEWER_PASSWORD;
        // El `viewerPassword &&` no es redundante: sin él, una variable
        // vacía o sin definir dejaría entrar con la contraseña vacía.
        if (viewerPassword && safeCompare(input.password, viewerPassword)) {
          await db.resetIpRateLimit(ipKey);
          await issueViewerSession(ctx);
          return { ticket: '', needsSetup: false, skipped2fa: true, viewer: true } as const;
        }

        // Clave de un socio de co-producción (ej. Dalmore): entra a SU
        // panel, siempre con segundo factor propio.
        const partnerCp = await coproductionSvc.findCoproductionByPassword(input.password);
        if (partnerCp) {
          await db.resetIpRateLimit(ipKey);
          const ticket = await signPartnerStepTicket(partnerCp);
          return { ticket, needsSetup: !partnerCp.totpConfirmedAt, partner: true } as const;
        }

        await db.recordIpFailedAttempt(ipKey);
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Contraseña incorrecta' });
      }

      // Vale de un solo uso para el segundo paso: sin esto habría que
      // volver a mandar la contraseña, o peor, confiar en que el cliente
      // dice la verdad sobre haberla pasado.
      await db.resetIpRateLimit(ipKey);

      // Válvula de escape que NO depende de la base de datos: con
      // ADMIN_2FA_DISABLED=1 en Vercel, la contraseña basta. Existe porque
      // un segundo factor que deja al dueño fuera de su propio negocio es
      // peor que no tenerlo, y tocar variables de entorno es más rápido
      // que entrar a la consola de la base a medianoche.
      if (process.env.ADMIN_2FA_DISABLED === '1') {
        await issueAdminSession(ctx);
        return { ticket: '', needsSetup: false, skipped2fa: true } as const;
      }

      const ticket = await signAdminStepTicket();
      const totp = await db.getAdminTotp();
      return { ticket, needsSetup: !totp?.confirmedAt } as const;
    }),

    // --- Entrar con el correo del dueño (variable ADMIN_EMAILS) ---
    // Primera llave alternativa a la contraseña. NO entrega sesión: igual que la contraseña, devuelve el vale
    // del paso 1 y falta el código de la app autenticadora (o de respaldo). Sin ADMIN_EMAILS no hace nada.
    adminEmailRequestCode: publicProcedure.input(z.object({ email: z.string().email().max(200) })).mutation(async ({ input, ctx }) => {
      const email = normalizeMemberEmail(input.email);
      const ipKey = `admin-email-send-ip:${clientIp(ctx)}`;
      const emailKey = `admin-email-send:${email}`;
      if (!(await db.checkIpRateLimit(ipKey)) || !(await db.checkIpRateLimit(emailKey))) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Pediste muchos códigos. Espera un rato e intenta de nuevo.' });
      }
      await db.recordIpAttempt(ipKey, 10, 60 * 60 * 1000);
      await db.recordIpAttempt(emailKey, 5, 60 * 60 * 1000);
      // Siempre responde igual: nadie averigua cuál correo es el del dueño.
      if (isAdminEmail(email)) {
        await sendEmail({ to: email, subject: '🔐 Tu código para entrar al panel', html: buildMemberCodeEmail({ code: currentMemberCode(adminLoginCodeKey(email)), name: null }) });
      }
      return { ok: true as const };
    }),
    adminEmailVerify: publicProcedure.input(z.object({ email: z.string().email().max(200), code: z.string().min(1).max(20) })).mutation(async ({ input, ctx }) => {
      const email = normalizeMemberEmail(input.email);
      const emailKey = `admin-email-verify:${email}`;
      const ipKey = `admin-email-verify-ip:${clientIp(ctx)}`;
      if (!(await db.checkIpRateLimit(emailKey)) || !(await db.checkIpRateLimit(ipKey))) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Espera unos minutos y pide un código nuevo.' });
      }
      if (!isAdminEmail(email) || !verifyMemberCode(adminLoginCodeKey(email), input.code)) {
        await db.recordIpAttempt(emailKey, 5, 15 * 60 * 1000);
        await db.recordIpAttempt(ipKey, 20, 15 * 60 * 1000);
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Código incorrecto o vencido.' });
      }
      return { ticket: await adminStepTicketForEmail(), needsSetup: false } as const;
    }),
    // ¿La sesión de «Mi cuenta» de este navegador es la del dueño? Muestra «Continuar como…» (correo enmascarado).
    adminEmailHint: publicProcedure.query(({ ctx }) => {
      const email = getMemberEmail(ctx.req);
      return email && isAdminEmail(email) ? { email: members.maskMemberEmail(email) } : null;
    }),
    // La app ya sabe quién eres (entraste a «Mi cuenta» con el código): sigue el segundo factor, sin pedir otro código.
    adminEmailFromMember: publicProcedure.mutation(async ({ ctx }) => {
      const ipKey = adminIpKey(ctx);
      if (!(await db.checkIpRateLimit(ipKey))) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Espera unos minutos.' });
      const email = getMemberEmail(ctx.req);
      if (!email || !isAdminEmail(email)) {
        await db.recordIpFailedAttempt(ipKey);
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Esta sesión no es la del administrador.' });
      }
      return { ticket: await adminStepTicketForEmail(), needsSetup: false } as const;
    }),

    // Genera el secreto y el QR para configurar la app de autenticación.
    // No activa nada todavía: recién se activa cuando el dueño confirma
    // con un código real (adminConfirmTotp).
    adminSetupTotp: publicProcedure.input(z.object({ ticket: z.string() })).mutation(async ({ input }) => {
      await requireAdminStepTicket(input.ticket);
      const existing = await db.getAdminTotp();
      if (existing?.confirmedAt) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'El segundo factor ya está configurado' });
      }
      // Reusa el secreto sin confirmar si ya existe: regenerarlo invalida
      // el QR que el dueño ya escaneó y lo deja sin poder confirmar nunca.
      const secret = await db.getOrCreateUnconfirmedAdminTotp(createTotpSecret());
      const qrImageUrl = await QRCode.toDataURL(totpUri(secret), { width: 320, margin: 2 });
      return { secret, qrImageUrl } as const;
    }),

    // Confirma la configuración y devuelve los códigos de respaldo. Es la
    // ÚNICA vez que se muestran legibles: después solo queda su hash.
    adminConfirmTotp: publicProcedure.input(z.object({ ticket: z.string(), code: z.string() }))
      .mutation(async ({ input, ctx }) => {
        await requireAdminStepTicket(input.ticket);
        const totp = await db.getAdminTotp();
        if (!totp) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Primero escanea el código QR' });
        if (totp.confirmedAt) throw new TRPCError({ code: 'FORBIDDEN', message: 'Ya está configurado' });

        const res = verifyTotp({ secret: totp.secret, token: input.code });
        if (!res.ok) {
          await db.recordIpFailedAttempt(adminIpKey(ctx));
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Ese código no coincide. Revisa que el reloj de tu teléfono esté en hora.' });
        }

        const { plain, hashed } = generateBackupCodes();
        await db.confirmAdminTotp(totp.id, hashed, res.timeStep);
        await issueAdminSession(ctx);
        return { backupCodes: plain } as const;
      }),

    // Paso 2 de 2: el código de la app (o uno de respaldo). Recién acá se
    // firma la sesión.
    adminVerifyCode: publicProcedure.input(z.object({ ticket: z.string(), code: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const ipKey = adminIpKey(ctx);
        if (!(await db.checkIpRateLimit(ipKey))) {
          throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Espera unos minutos.' });
        }
        await requireAdminStepTicket(input.ticket);

        const totp = await db.getAdminTotp();
        if (!totp?.confirmedAt) throw new TRPCError({ code: 'BAD_REQUEST', message: 'El segundo factor no está configurado' });

        const res = verifyTotp({ secret: totp.secret, token: input.code, lastUsedStep: totp.lastUsedStep });
        if (res.ok) {
          await db.recordAdminTotpStep(totp.id, res.timeStep);
          await db.resetIpRateLimit(ipKey);
          await issueAdminSession(ctx);
          return { success: true } as const;
        }

        // Si no era un código de la app, puede ser uno de respaldo.
        const backup = consumeBackupCode(parseBackupCodes(totp.backupCodes), input.code);
        if (backup.ok) {
          await db.consumeAdminBackupCodes(totp.id, backup.remaining);
          await db.resetIpRateLimit(ipKey);
          await issueAdminSession(ctx);
          return { success: true, backupCodeUsed: true, backupCodesLeft: backup.remaining.length } as const;
        }

        await db.recordIpFailedAttempt(ipKey);
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: res.reason === 'reusado' ? 'Ese código ya se usó. Espera al siguiente.' : 'Código incorrecto',
        });
      }),

    // --- Segundo factor del socio de una co-producción ---
    // Mismo flujo que el del dueño, pero contra el secreto guardado en SU
    // fila de `coproductions`. Configurar la primera vez, después código.
    partnerSetupTotp: publicProcedure.input(z.object({ ticket: z.string() })).mutation(async ({ input }) => {
      const cp = await requirePartnerStepTicket(input.ticket);
      if (cp.totpConfirmedAt) throw new TRPCError({ code: 'FORBIDDEN', message: 'El segundo factor ya está configurado' });
      const secret = cp.totpSecret ?? createTotpSecret();
      if (!cp.totpSecret) await coproductionSvc.setPartnerTotp(cp.id, { totpSecret: secret });
      const qrImageUrl = await QRCode.toDataURL(totpUri(secret, `${cp.partnerName} · Playroom`), { width: 320, margin: 2 });
      return { secret, qrImageUrl } as const;
    }),
    partnerConfirmTotp: publicProcedure.input(z.object({ ticket: z.string(), code: z.string() })).mutation(async ({ input, ctx }) => {
      const cp = await requirePartnerStepTicket(input.ticket);
      if (cp.totpConfirmedAt) throw new TRPCError({ code: 'FORBIDDEN', message: 'Ya está configurado' });
      if (!cp.totpSecret) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Primero escanea el código QR' });
      const res = verifyTotp({ secret: cp.totpSecret, token: input.code });
      if (!res.ok) {
        await db.recordIpFailedAttempt(adminIpKey(ctx));
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Ese código no coincide. Revisa que el reloj de tu teléfono esté en hora.' });
      }
      const { plain, hashed } = generateBackupCodes();
      await coproductionSvc.setPartnerTotp(cp.id, { totpConfirmedAt: new Date(), totpBackupCodes: hashed, totpLastUsedStep: res.timeStep });
      await issuePartnerSession(ctx, cp);
      return { backupCodes: plain } as const;
    }),
    partnerVerifyCode: publicProcedure.input(z.object({ ticket: z.string(), code: z.string() })).mutation(async ({ input, ctx }) => {
      const ipKey = adminIpKey(ctx);
      if (!(await db.checkIpRateLimit(ipKey))) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Espera unos minutos.' });
      }
      const cp = await requirePartnerStepTicket(input.ticket);
      if (!cp.totpConfirmedAt || !cp.totpSecret) throw new TRPCError({ code: 'BAD_REQUEST', message: 'El segundo factor no está configurado' });
      const res = verifyTotp({ secret: cp.totpSecret, token: input.code, lastUsedStep: cp.totpLastUsedStep });
      if (res.ok) {
        await coproductionSvc.setPartnerTotp(cp.id, { totpLastUsedStep: res.timeStep });
        await db.resetIpRateLimit(ipKey);
        await issuePartnerSession(ctx, cp);
        return { success: true } as const;
      }
      const backup = consumeBackupCode(parseBackupCodes(cp.totpBackupCodes), input.code);
      if (backup.ok) {
        await coproductionSvc.setPartnerTotp(cp.id, { totpBackupCodes: backup.remaining });
        await db.resetIpRateLimit(ipKey);
        await issuePartnerSession(ctx, cp);
        return { success: true, backupCodeUsed: true, backupCodesLeft: backup.remaining.length } as const;
      }
      await db.recordIpFailedAttempt(ipKey);
      throw new TRPCError({ code: 'UNAUTHORIZED', message: res.reason === 'reusado' ? 'Ese código ya se usó. Espera al siguiente.' : 'Código incorrecto' });
    }),

    // --- Passkeys (Face ID / Touch ID / Windows Hello) ---
    // Adicionales al login de arriba, no lo reemplazan. Registro: requiere
    // estar logueado (adminProcedure) -- solo el dueño, ya autenticado con
    // contraseña+TOTP, puede sumar un dispositivo nuevo.
    webauthnRegistrationOptions: adminProcedure.mutation(async ({ ctx }) => {
      const { rpID } = getRpIdAndOrigin(ctx.req);
      const existing = await db.getAdminWebauthnCredentials();
      const options = await buildRegistrationOptions({
        rpID,
        existingCredentialIds: existing.map((c) => c.credentialId),
      });
      const ticket = await signWebauthnTicket('reg', options.challenge);
      return { options, ticket } as const;
    }),

    webauthnRegistrationVerify: adminProcedure.input(z.object({
      ticket: z.string(),
      deviceLabel: z.string().min(1).max(100),
      response: z.any(),
    })).mutation(async ({ input, ctx }) => {
      const challenge = await requireWebauthnTicket('reg', input.ticket);
      const { rpID, origin } = getRpIdAndOrigin(ctx.req);
      const verification = await verifyRegistration({
        response: input.response,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
      });
      if (!verification.verified || !verification.registrationInfo) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No se pudo verificar el dispositivo.' });
      }
      const { credential } = verification.registrationInfo;
      await db.saveAdminWebauthnCredential({
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString('base64url'),
        counter: credential.counter,
        transports: credential.transports,
        deviceLabel: input.deviceLabel,
      });
      return { success: true } as const;
    }),

    // Login: sin sesión previa (publicProcedure) -- es justamente la forma
    // de entrar. No hace falta listar credenciales de antemano: son
    // "discoverable credentials", el propio sistema operativo le muestra al
    // dueño cuál usar.
    webauthnLoginOptions: publicProcedure.mutation(async ({ ctx }) => {
      const { rpID } = getRpIdAndOrigin(ctx.req);
      const options = await buildAuthenticationOptions({ rpID });
      const ticket = await signWebauthnTicket('auth', options.challenge);
      return { options, ticket } as const;
    }),

    webauthnLoginVerify: publicProcedure.input(z.object({
      ticket: z.string(),
      response: z.any(),
    })).mutation(async ({ input, ctx }) => {
      await verifyAdminPasskey(ctx, { kind: 'auth', ticket: input.ticket, response: input.response, ipKey: adminIpKey(ctx) });
      await issueAdminSession(ctx);
      return { success: true } as const;
    }),

    // Borrar con Face ID: mismo passkey del login, pero con la sesión ya
    // abierta. Devuelve el permiso de 60 s que reemplaza la clave de admin
    // en las acciones destructivas (ver signFaceIdDeleteGrant). Mismo
    // límite por IP que la clave en esas acciones ('admin-reauth').
    webauthnReauthOptions: adminProcedure.mutation(async ({ ctx }) => {
      const { rpID } = getRpIdAndOrigin(ctx.req);
      const options = await buildAuthenticationOptions({ rpID });
      const ticket = await signWebauthnTicket('reauth', options.challenge);
      return { options, ticket } as const;
    }),

    webauthnReauthVerify: adminProcedure.input(z.object({
      ticket: z.string(),
      response: z.any(),
    })).mutation(async ({ input, ctx }) => {
      await verifyAdminPasskey(ctx, { kind: 'reauth', ticket: input.ticket, response: input.response, ipKey: `admin-reauth:${clientIp(ctx)}` });
      return { grant: await signFaceIdDeleteGrant() } as const;
    }),

    webauthnCredentialsList: adminProcedure.query(async () => {
      const rows = await db.getAdminWebauthnCredentials();
      return rows.map((r) => ({ id: r.id, credentialId: r.credentialId, deviceLabel: r.deviceLabel, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt }));
    }),
    // Identidad que el llavero usa para agrupar las llaves del dueño: el
    // cliente la necesita para la Signal API (no es un secreto).
    webauthnUserInfo: adminProcedure.query(() => ({
      userId: ADMIN_WEBAUTHN_USER_ID_B64URL, name: ADMIN_WEBAUTHN_USER_NAME, displayName: ADMIN_WEBAUTHN_USER_DISPLAY_NAME,
    })),
    webauthnCredentialDeleteAll: adminProcedure.mutation(async () => {
      await db.deleteAllAdminWebauthnCredentials();
      return { success: true } as const;
    }),

    webauthnCredentialDelete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await db.deleteAdminWebauthnCredential(input.id);
      return { success: true } as const;
    }),
  }),

  events: router({
    listPublished: publicProcedure.query(async () => {
      return db.getPublishedEvents();
    }),
    // Para la sección "Próximos Eventos" de la home: incluye publicados y pasados
    // (para mostrar el historial en blanco y negro junto a los próximos a color).
    listForHome: publicProcedure.query(async () => {
      return db.getHomeEvents();
    }),
    // Un evento de co-producción sin activar no existe para el público (ni
    // por link directo); el dueño sí lo ve para revisarlo.
    getBySlug: publicProcedure.input(z.object({ slug: z.string() })).query(async ({ input, ctx }) => {
      const event = await db.getEventBySlug(input.slug);
      if (event && ctx.user?.role !== 'admin' && await coproductionSvc.isEventHiddenByCoproduction(event.id)) return undefined;
      return event;
    }),
    getTicketTypes: publicProcedure.input(z.object({ slug: z.string() })).query(async ({ input, ctx }) => {
      const event = await db.getEventBySlug(input.slug);
      if (!event) return [];
      if (ctx.user?.role !== 'admin' && await coproductionSvc.isEventHiddenByCoproduction(event.id)) return [];
      // Cualquier visitante viendo precios dispara el chequeo de avance
      // automático de tanda (por fecha o cupo agotado) -- ver
      // server/tandaAutoAdvance.ts. Home.tsx ya hace polling de esta misma
      // consulta cada 30s, así que no hace falta ningún cron nuevo.
      await checkAndAdvanceTandaIfNeeded(event.id);
      return db.getTicketTypesByEventId(event.id);
    }),
    // Admin
    listAll: adminReadProcedure.query(async () => {
      return db.getAllEvents();
    }),
    // El mismo criterio que usa /caja, /cocina y /guardarropia para elegir
    // "el evento de esta noche" (el publicado más cercano a hoy en fecha) --
    // sirve para que el admin (ej. el selector de la sección Caja) arranque
    // apuntando al evento correcto sin que el usuario tenga que elegirlo a
    // mano. `listAll` en cambio ordena por creación, así que un evento viejo
    // o de prueba creado después podía terminar como "seleccionado" por
    // defecto aunque no fuera el que /caja estaba usando de verdad.
    getActiveForCaja: adminReadProcedure.query(async () => {
      return db.getActiveEventForCaja() ?? null;
    }),
    create: adminProcedure.input(z.object({
      title: z.string(),
      slug: z.string(),
      description: z.string().optional(),
      shortDescription: z.string().optional(),
      imageUrl: z.string().optional(),
      venue: z.string().optional(),
      address: z.string().optional(),
      mapsUrl: z.string().optional(),
      eventDate: z.string(),
      doorsOpen: z.string().optional(),
      eventEnd: z.string().optional(),
      status: z.enum(['draft', 'published', 'soldout', 'cancelled', 'past']).optional(),
      featured: z.number().optional(),
      missionForceClosed: z.number().optional(),
      ivaApplies: z.number().optional(),
      taxIssuer: z.enum(['mansion', 'tercero', 'exento', 'por_revisar']).optional(),
      taxNote: z.string().max(255).nullish(),
    })).mutation(async ({ input }) => {
      const result = await db.createEvent(withTaxIssuer(input));
      // La Carta de la Fiesta nace vacía si no se hace nada -- se le copia
      // la del evento anterior automáticamente, sin bloquear la creación
      // si algo falla (un evento sin carta copiada es mejor que ninguno).
      try {
        const created = await db.getEventBySlug(input.slug);
        const previous = (await db.getAllEvents()).find((e) => e.id !== created?.id && new Date(e.eventDate) < new Date(input.eventDate));
        if (created && previous) await db.copyCartaBetweenEvents(previous.id, created.id);
        // Aviso push "nuevo evento" (si está prendido en Push → Automáticos).
        if (created && input.status === 'published') await notifyEventLaunch(created.id, 'evento');
        // Borradores del contenido para embajadores (quedan para aprobar).
        if (created && input.status === 'published') await ensureAmbassadorDrafts().catch((e) => console.error('[events.create] Borradores de embajadores:', e));
      } catch (err) {
        console.error('[events.create] No se pudo copiar la carta del evento anterior:', err);
      }
      return result;
    }),
    // Botón manual "Copiar carta del evento anterior" en Carta de la
    // Fiesta -- mismo criterio que el automático de arriba, para poder
    // repetirlo a mano (o arreglar un evento que quedó sin carta).
    copyCartaFromPrevious: adminProcedure.input(z.object({ eventId: z.number() })).mutation(async ({ input }) => {
      const target = await db.getEventById(input.eventId);
      if (!target) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Evento no encontrado' });
      const previous = (await db.getAllEvents()).find((e) => e.id !== target.id && new Date(e.eventDate) < new Date(target.eventDate));
      if (!previous) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No hay un evento anterior del cual copiar' });
      const copied = await db.copyCartaBetweenEvents(previous.id, target.id);
      return { copied, from: previous.title };
    }),
    update: adminProcedure.input(z.object({
      id: z.number(),
      title: z.string().optional(),
      slug: z.string().optional(),
      description: z.string().optional(),
      shortDescription: z.string().optional(),
      imageUrl: z.string().optional(),
      venue: z.string().optional(),
      address: z.string().optional(),
      mapsUrl: z.string().optional(),
      eventDate: z.string().optional(),
      doorsOpen: z.string().optional(),
      eventEnd: z.string().optional(),
      status: z.enum(['draft', 'published', 'soldout', 'cancelled', 'past']).optional(),
      featured: z.number().optional(),
      missionForceClosed: z.number().optional(),
      ivaApplies: z.number().optional(),
      taxIssuer: z.enum(['mansion', 'tercero', 'exento', 'por_revisar']).optional(),
      taxNote: z.string().max(255).nullish(),
      // Preventa anticipada para socios: hasta esta fecha solo compran quienes entraron a «Mi cuenta». Vacío = sin preventa.
      memberEarlyUntil: z.string().nullable().optional(),
      // Escala de descuentos por fase de este evento -- ver
      // shared/tandaSchedule.ts (TandaPhase[]: % + fecha límite opcional
      // por fase, para el avance automático). Editable desde el admin, por
      // evento.
      tandaDiscountSchedule: z.array(z.object({
        percent: z.number().min(0).max(100),
        untilDate: z.string().nullable().optional(),
      })).optional(),
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      const before = input.status === 'published' ? await db.getEventById(id) : null;
      const result = await db.updateEvent(id, withTaxIssuer(data));
      // Recién publicado (venía en borrador): aviso push "nuevo evento".
      if (before && before.status === 'draft') await notifyEventLaunch(id, 'evento');
      // Borradores del contenido para embajadores (quedan para aprobar).
      if (input.status === 'published') await ensureAmbassadorDrafts().catch((e) => console.error('[events.update] Borradores de embajadores:', e));
      return result;
    }),
    delete: adminPasswordProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const before = await db.getEventById(input.id);
      const result = await db.deleteEvent(input.id);
      await db.recordAdminAudit({ action: 'events.delete', targetType: 'event', targetId: input.id, eventId: input.id, payload: before ?? null, ip: clientIp(ctx) });
      return result;
    }),
    // Ticket types management
    listTicketTypes: adminReadProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return db.getTicketTypesByEventId(input.eventId);
    }),
    createTicketType: adminProcedure.input(z.object({
      eventId: z.number(),
      name: z.string(),
      accesoSlug: z.enum(['duo', 'duo_mujeres', 'soltera', 'soltero', 'trio', 'grupo', 'cumpleaneros']).optional(),
      category: z.enum(['acceso', 'extra', 'consumo', 'locker', 'merch']).optional(),
      description: z.string().optional(),
      price: z.number(),
      originalPrice: z.number().optional(),
      totalStock: z.number(),
      maxPerOrder: z.number().optional(),
      sortOrder: z.number().optional(),
      status: z.enum(['active', 'soldout', 'hidden']).optional(),
      costPrice: z.number().optional(),
      color: z.string().optional(),
      internalCode: z.string().optional(),
      // Carta de la fiesta (tragos/comida/guardarropía): emoji en vez de foto,
      // sección para agrupar en la grilla de /caja, y si va a cocina.
      emoji: z.string().max(8).optional(),
      groupName: z.string().max(50).optional(),
      toKitchen: z.number().min(0).max(1).optional(),
      // Cupo compartido (stockPools) -- null/omitido = sigue usando su propio
      // totalStock, como hoy.
      stockPoolId: z.number().nullable().optional(),
      // Carga de saldo prepagado (pedido explícito del dueño): con valor,
      // este producto acredita saldo en vez de dar un derecho canjeable --
      // ver el comentario de la columna en drizzle/schema.ts.
      topupAmount: z.number().int().positive().optional(),
    })).mutation(async ({ input }) => {
      return db.createTicketType(input);
    }),
    updateTicketType: adminProcedure.input(z.object({
      id: z.number(),
      name: z.string().optional(),
      accesoSlug: z.enum(['duo', 'duo_mujeres', 'soltera', 'soltero', 'trio', 'grupo', 'cumpleaneros']).optional(),
      category: z.enum(['acceso', 'extra', 'consumo', 'locker', 'merch']).optional(),
      description: z.string().optional(),
      price: z.number().optional(),
      originalPrice: z.number().optional(),
      totalStock: z.number().optional(),
      maxPerOrder: z.number().optional(),
      sortOrder: z.number().optional(),
      status: z.enum(['active', 'soldout', 'hidden']).optional(),
      costPrice: z.number().optional(),
      color: z.string().optional(),
      internalCode: z.string().optional(),
      // Carta de la fiesta (tragos/comida/guardarropía): emoji en vez de foto,
      // sección para agrupar en la grilla de /caja, y si va a cocina.
      emoji: z.string().max(8).optional(),
      groupName: z.string().max(50).optional(),
      toKitchen: z.number().min(0).max(1).optional(),
      stockPoolId: z.number().nullable().optional(),
      topupAmount: z.number().int().positive().nullable().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      return db.updateTicketType(id, data, ctx.user.id);
    }),
    deleteTicketType: adminPasswordProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const result = await db.deleteTicketType(input.id);
      await db.recordAdminAudit({ action: 'events.deleteTicketType', targetType: 'ticketType', targetId: input.id, ip: clientIp(ctx) });
      return result;
    }),
    // "Cerrar tanda y activar la siguiente" -- cierra cada fila hoy activa
    // (queda soldout) y crea la siguiente ya activa, con precio/stock
    // nuevos. Avance de fase 100% manual, ver comentario en db.advanceTanda.
    advanceTanda: adminProcedure.input(z.object({
      eventId: z.number(),
      rows: z.array(z.object({
        oldTicketTypeId: z.number(),
        newPrice: z.number(),
        newTotalStock: z.number(),
        newStockPoolId: z.number().nullable().optional(),
      })).min(1),
    })).mutation(async ({ input }) => {
      const result = await db.advanceTanda(input.eventId, input.rows);
      await notifyEventLaunch(input.eventId, 'preventa');
      return result;
    }),
    ticketStockHistory: adminReadProcedure.input(z.object({ ticketTypeId: z.number() })).query(async ({ input }) => {
      return db.getTicketStockHistory(input.ticketTypeId);
    }),
    // Cupos compartidos (stockPools) -- ver drizzle/schema.ts. El admin ve el
    // número real siempre; lo que se esconde es solo la vista pública.
    listStockPools: adminReadProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return db.getStockPoolsByEventId(input.eventId);
    }),
    createStockPool: adminProcedure.input(z.object({
      eventId: z.number(),
      name: z.string().min(1),
      totalCap: z.number().int().positive(),
    })).mutation(async ({ input }) => {
      return db.createStockPool(input);
    }),
    updateStockPool: adminProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      totalCap: z.number().int().positive().optional(),
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      return db.updateStockPool(id, data);
    }),
    deleteStockPool: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      return db.deleteStockPool(input.id);
    }),
    // IA: descripción corta + completa a partir de los datos del evento y una
    // idea/tema libre y opcional (no se guarda, ver server/eventDescriptions.ts).
    generateDescription: adminProcedure.input(z.object({
      title: z.string().min(1),
      venue: z.string().optional(),
      address: z.string().optional(),
      eventDateISO: z.string().optional(),
      idea: z.string().max(500).optional(),
    })).mutation(async ({ input }) => {
      try {
        return await generateEventDescription(input);
      } catch (err) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err instanceof Error ? err.message : 'No se pudo generar la descripción.' });
      }
    }),
  }),

  /* Devolución de una compra web (política: 50% hasta 5 días antes). Solo registra: la plata se devuelve a mano. */
  orderRefund: router({
    refund: adminPasswordProcedure.input(z.object({
      orderId: z.number(),
      percent: z.number().min(0).max(100).optional(),
      amount: z.number().int().min(1).optional(),
      reason: z.string().max(500).optional(),
      overrideDeadline: z.boolean().optional(),
    })).mutation(async ({ input, ctx }) => {
      if (input.percent == null && input.amount == null) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Indica el porcentaje o el monto a devolver.' });
      try {
        return await refundOrder({ ...input, ip: clientIp(ctx) });
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo registrar la devolución.' });
      }
    }),
  }),

  /* Crédito de acceso: dejar el acceso de una compra vigente para un evento futuro. */
  accessCredit: router({
    list: adminReadProcedure.query(() => listAccessCredits()),
    createFromOrder: adminPasswordProcedure.input(z.object({ orderId: z.number() })).mutation(async ({ input, ctx }) => {
      try {
        return await issueAccessCreditsForOrder(input.orderId, { ip: clientIp(ctx) });
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo dejar el crédito.' });
      }
    }),
    remind: adminProcedure.input(z.object({ creditId: z.number() })).mutation(async ({ input }) => {
      try {
        return await remindAccessCredit(input.creditId);
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo mandar el recordatorio.' });
      }
    }),
  }),

  orders: router({
    validateDiscount: publicProcedure.input(z.object({
      code: z.string(),
      eventId: z.number(),
    })).mutation(async ({ input }) => {
      return db.validateDiscountCode(input.code, input.eventId);
    }),
    /** Un solo campo de código en el checkout: la persona no sabe (ni le
     * importa) si lo que tiene es un código de descuento o el código de quien
     * la invitó -- este endpoint decide por ella. Se prueba primero contra
     * embajadores y después contra descuentos: cuando más adelante un código
     * de embajador también traiga descuento propio, esta rama es la que va a
     * empezar a incluirlo, sin tocar la rama de descuento puro. */
    validateCode: publicProcedure.input(z.object({
      code: z.string(),
      eventId: z.number(),
    })).mutation(async ({ input }) => {
      const clean = input.code.trim();
      if (!clean) return { type: 'none' as const, message: 'Escribe un código' };

      const ambassador = await db.getActiveExclusiveAmbassadorByCode(clean);
      if (ambassador) {
        return { type: 'ambassador' as const, name: ambassador.name, code: ambassador.code, buyerDiscountPercent: effectiveBuyerDiscountPercent(ambassador.buyerDiscountPercent, await db.getGeneralBuyerDiscount()) };
      }

      // Crédito de acceso ("1 Acceso Dúo" que quedó vigente de otra fiesta).
      const creditHit = await db.findAccessCreditByCode(clean);
      if (creditHit) {
        if (creditHit.availability === 'expired') return { type: 'none' as const, message: 'Este pase venció' };
        if (creditHit.availability !== 'available') return { type: 'none' as const, message: 'Este crédito ya fue usado' };
        const passError = giftPassError(creditHit.credit, input.eventId);
        if (passError) return { type: 'none' as const, message: passError };
        return { type: 'credit' as const, code: creditHit.credit.code, accesoSlug: creditHit.credit.accesoSlug, accesoName: creditHit.credit.accesoName };
      }

      const discountResult = await db.validateDiscountCode(clean, input.eventId);
      if (discountResult.valid && discountResult.discount) {
        return { type: 'discount' as const, discount: discountResult.discount };
      }

      return { type: 'none' as const, message: 'No encontramos ese código' };
    }),
    create: publicProcedure.input(z.object({
      eventSlug: z.string(),
      buyerName: z.string(),
      buyerEmail: z.string().email(),
      buyerPhone: z.string().optional(),
      items: z.array(z.object({
        ticketTypeId: z.number(),
        quantity: z.number().min(1),
      })),
      discountCode: z.string().optional(),
      ambassadorCode: z.string().optional(),
      communityCode: z.string().optional(),
      // Datos por asistente/tipo de acceso (JSON serializado). Se adjunta a la
      // preferencia de Mercado Pago como metadata; no requiere migración de schema.
      attendeeData: z.string().optional(),
      // Atribución UTM (ver client/src/lib/utm.ts): de dónde vino la venta
      // cuando no es por código de embajador.
      utmSource: z.string().max(100).optional(),
      utmMedium: z.string().max(100).optional(),
      utmCampaign: z.string().max(100).optional(),
      utmContent: z.string().max(100).optional(),
      // Link de campaña aliada (/electronica), ver server/partnerCampaigns.ts.
      partnerSlug: z.string().max(50).optional(),
      partnerRef: z.string().max(32).optional(),
    })).mutation(async ({ input, ctx }) => {
      // +18: el checkout web lo confirma con un check; acá se exige (antes era solo una regla del navegador).
      if (!checkoutConfirmedAdult(input.attendeeData)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Debes confirmar que eres mayor de 18 años para comprar.' });
      }
      const target = await db.getEventBySlug(input.eventSlug);
      if (target && await coproductionSvc.isEventHiddenByCoproduction(target.id)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Las entradas de este evento todavía no están a la venta.' });
      }
      // Preventa anticipada de socios: hasta la fecha del evento solo compra quien entró a «Mi cuenta» con el mismo correo.
      if (target && isMemberEarlyAccess(target)) {
        const me = getMemberEmail(ctx.req);
        if (!me || me !== normalizeMemberEmail(input.buyerEmail) || !(await members.isMember(me))) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Preventa anticipada para socios: entra a tu cuenta con el correo de tu compra para comprar ahora. Las entradas se abren para todos más tarde.' });
        }
      }
      // Un cupón personal solo lo usa su dueño.
      try { await members.assertCouponOwner(input.discountCode, input.buyerEmail); } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'Cupón no válido' });
      }
      // Soltero aprobado en su cuenta: compra Soltero / Dúo de dos hombres sin código (la sesión lo
      // identifica; el correo de la compra tiene que ser el mismo, ver createOrder).
      const memberEmail = getMemberEmail(ctx.req);
      const solteroApprovedEmail = memberEmail && (await solteros.isSolteroApproved(memberEmail)) ? memberEmail : null;
      let result: Awaited<ReturnType<typeof db.createOrder>>;
      try {
        result = await db.createOrder({ ...input, solteroApprovedEmail });
      } catch (err) {
        // Las reglas de quién puede comprar (código, aprobación, datos de la primera compra) se le muestran tal cual.
        const message = err instanceof Error ? err.message : '';
        if (/código de comunidad|estar aprobado|primera compra/.test(message)) throw new TRPCError({ code: 'BAD_REQUEST', message });
        throw err;
      }
      // Descuento del 100%: la orden ya quedó aprobada en createOrder (sin
      // pasar por Mercado Pago) — acá solo falta el email de bienvenida+QR.
      // La orden ya está aprobada: si el correo falla no se le muestra un error a la persona (reintentaría
      // y crearía otra orden). El envío se reintenta solo con "reenviar correo" desde el admin.
      if (result.isFree) {
        try { await confirmFreeOrder(result.orderNumber); } catch (err) {
          console.error(`[Orders] Orden gratis ${result.orderNumber} aprobada, pero falló el correo/QR:`, err);
        }
      }
      return result;
    }),
    // Cobra una orden ya creada con el Payment Brick (tarjeta embebida, sin
    // modal/redirect de Mercado Pago). El monto se calcula server-side a
    // partir de la orden guardada, nunca del cliente.
    processCardPayment: publicProcedure.input(z.object({
      orderNumber: z.string(),
      token: z.string(),
      paymentMethodId: z.string(),
      issuerId: z.union([z.string(), z.number()]).optional(),
      installments: z.number().optional(),
      identificationType: z.string().optional(),
      identificationNumber: z.string().optional(),
      saveCard: z.boolean().optional(),
    })).mutation(async ({ input, ctx }) => {
      return processCardPaymentForOrder({ ...input, memberEmail: getMemberEmail(ctx.req) });
    }),
    // Admin
    listAll: adminReadProcedure.input(z.object({
      page: z.number().optional(),
      limit: z.number().optional(),
      status: z.string().optional(),
      channel: z.enum(['web', 'caja']).optional(),
      eventId: z.number().optional(),
      search: z.string().max(100).optional(),
      // Solo las ventas de una campaña aliada (filtro 🎧 de Ventas Web).
      partnerCampaignId: z.number().optional(),
    }).optional()).query(async ({ input }) => {
      const { partnerCampaignId, ...filters } = input ?? {};
      const onlyOrderIds = partnerCampaignId ? await partnerSvc.getPartnerOrderIds(partnerCampaignId) : undefined;
      const result = await db.getAllOrders({ ...filters, onlyOrderIds });
      // Solicitudes de "pasar a Trío" pendientes de pago, para la etiqueta de la
      // fila. Sin el link de pago: la lista también la ve el rol demo.
      const ids = result.orders.map((o) => o.id);
      const pending = await getPendingUpgradesByOrderIds(ids);
      const pendingAddons = await getPendingAddonsByOrderIds(ids);
      const credits = await listCreditsByOrderIds(ids);
      const partnerBadges = await partnerSvc.getPartnerBadgesByOrderIds(ids);
      return {
        ...result,
        orders: result.orders.map((o) => ({
          ...o,
          partnerBadge: partnerBadges.get(o.id) ?? null,
          pendingUpgrade: pending.get(o.id) ?? null,
          pendingAddons: pendingAddons.get(o.id) ?? null,
          credits: credits.filter((c) => c.originOrderId === o.id).map((c) => ({ id: c.id, code: c.code, availability: c.availability })),
        })),
      };
    }),
    /* Cuántas órdenes hay por estado (botones de Ventas Web/Caja). */
    statusCounts: adminReadProcedure.input(z.object({
      channel: z.enum(['web', 'caja']).optional(),
      eventId: z.number().optional(),
    }).optional()).query(async ({ input }) => {
      return db.getOrderStatusCounts(input?.channel, input?.eventId);
    }),
    /* Coincidencias de una búsqueda en todos los eventos/canales/estados (para
     * avisar cuando Ventas Web no las muestra por los filtros puestos). */
    findMatching: adminReadProcedure.input(z.object({ search: z.string().trim().min(2).max(100) })).query(async ({ input }) => {
      return db.findOrdersMatching(input.search);
    }),
    getStats: adminReadProcedure.input(z.object({
      channel: z.enum(['web', 'caja']).optional(),
      eventId: z.number().optional(),
    }).optional()).query(async ({ input }) => {
      return db.getOrderStats(input?.channel, input?.eventId);
    }),
    // "Ventas por origen" (atribución UTM, agujero 2 del plan de ventas).
    salesByOrigin: adminReadProcedure.input(z.object({ eventId: z.number().optional() }).optional()).query(async ({ input }) => {
      return db.getSalesByUtmOrigin(input?.eventId);
    }),
    // Curva de ventas web por día de Chile (Inicio del admin).
    salesByDay: adminReadProcedure.input(z.object({ eventId: z.number().optional() }).optional()).query(async ({ input }) => {
      return db.getSalesByDay(input?.eventId);
    }),
    // Mismos filtros y mismas columnas que el CSV (server/adminRoutes.ts) --
    // alimenta la vista de impresión/PDF, para que ambos formatos muestren
    // exactamente lo mismo.
    forPrint: adminReadProcedure.input(z.object({
      eventId: z.number().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      status: z.string().optional(),
      channel: z.enum(['web', 'caja']).optional(),
    }).optional()).query(async ({ input }) => {
      return db.getOrdersForExport(input ?? {});
    }),
    getTickets: adminReadProcedure.input(z.object({ orderId: z.number() })).query(async ({ input }) => {
      return db.getOrderTickets(input.orderId);
    }),
    resendConfirmation: adminProcedure.input(z.object({ orderNumber: z.string() })).mutation(async ({ input }) => {
      return resendConfirmationEmail(input.orderNumber);
    }),
    // Corregir nombre/RUT de titular y acompañantes (Ventas Web): la gente
    // escribe mal su nombre y debe calzar con el carnet para entrar. Sin
    // contraseña extra a propósito (uso diario, pedido del dueño) -- queda
    // el antes/después en el historial de auditoría.
    updateAttendees: adminProcedure.input(z.object({
      orderId: z.number(),
      people: z.array(z.object({
        slot: z.string().min(1).max(80),
        fullName: z.string(),
        rut: z.string().optional(),
      })).min(1).max(30),
    })).mutation(async ({ input, ctx }) => {
      const people = input.people.map((p) => {
        const fullName = p.fullName.replace(/\s+/g, ' ').trim();
        if (fullName.length < 3 || fullName.length > 120) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cada nombre debe tener entre 3 y 120 caracteres.' });
        }
        const rutRaw = (p.rut ?? '').trim();
        if (rutRaw && !isValidRut(rutRaw)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `El RUT "${rutRaw}" no es válido.` });
        }
        return { slot: p.slot, fullName, rut: rutRaw ? formatRutLive(rutRaw) : undefined };
      });
      let result;
      try {
        result = await db.updateOrderAttendees(input.orderId, people);
      } catch (error) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: error instanceof Error ? error.message : 'No se pudo guardar.' });
      }
      await db.recordAdminAudit({
        action: 'orders.updateAttendees', targetType: 'order', targetId: input.orderId,
        eventId: result.eventId ?? null, payload: { before: result.before, after: result.after }, ip: clientIp(ctx),
      });
      return { success: true, attendeeSlots: result.after };
    }),
    // "Aprobar sin pagar" (Ventas Web): para compradores con un beneficio que
    // los exime de pagar la diferencia de Misión 300 -- genera el ticket con
    // QR y manda el correo final sin pago real de por medio.
    approveMissionTopup: adminProcedure.input(z.object({ orderId: z.number() })).mutation(async ({ input }) => {
      return approveMissionTopupWithoutPayment(input.orderId);
    }),

    // Pasar un acceso Dúo a Trío cobrando la diferencia (server/orderUpgrade.ts).
    // `previewUpgrade` es adminProcedure (no adminReadProcedure) a propósito:
    // trae el link de pago, que el rol demo no debe ver.
    previewUpgrade: adminProcedure.input(z.object({ orderId: z.number() })).query(async ({ input }) => {
      return upgradeErrorsAsBadRequest(() => previewUpgrade(input.orderId));
    }),
    // El acceso de destino y las personas se validan en el servidor contra lo que
    // esa orden realmente puede hacer (createUpgradeRequest): lo que mande el
    // cliente nunca decide el precio ni a qué acceso se puede subir.
    requestUpgrade: adminProcedure.input(z.object({
      orderId: z.number(),
      toTicketTypeId: z.number(),
      amount: z.number().int().min(0).max(5_000_000),
      people: z.array(z.object({
        n: z.number().int().min(1).max(9),
        name: z.string().max(120).optional(),
        rut: z.string().max(20).optional(),
        instagram: z.string().max(80).optional(),
      })).max(9).optional(),
    })).mutation(async ({ input }) => {
      return upgradeErrorsAsBadRequest(async () => {
        const { upgrade, created } = await createUpgradeRequest({
          orderId: input.orderId,
          toTicketTypeId: input.toTicketTypeId,
          amount: input.amount,
          people: input.people,
        });
        return { upgradeId: upgrade.id, created, amount: Number(upgrade.amount), paymentUrl: upgrade.paymentUrl };
      });
    }),
    sendUpgradeEmail: adminProcedure.input(z.object({ upgradeId: z.number() })).mutation(async ({ input }) => {
      return upgradeErrorsAsBadRequest(() => sendUpgradeRequestEmail(input.upgradeId));
    }),
    // "Marcar como pagado" (transferencia o efectivo): aplica el upgrade igual
    // que un pago de Mercado Pago. Exactamente una vez, ver settleUpgrade.
    markUpgradePaid: adminProcedure.input(z.object({ upgradeId: z.number() })).mutation(async ({ input, ctx }) => {
      return upgradeErrorsAsBadRequest(() => settleUpgradeAndNotify(input.upgradeId, { method: 'manual', ip: clientIp(ctx) }));
    }),
    cancelUpgrade: adminProcedure.input(z.object({ upgradeId: z.number() })).mutation(async ({ input }) => {
      return upgradeErrorsAsBadRequest(() => cancelUpgrade(input.upgradeId));
    }),

    // Agregar un extra (estacionamiento, piscolas...) a una compra ya hecha, con su
    // propio link de pago (server/orderAddon.ts). Mismos motivos que arriba:
    // `previewAddons` trae el link de pago, así que es adminProcedure; el extra y
    // la cantidad se validan en el servidor y el monto sale de la base de datos.
    previewAddons: adminProcedure.input(z.object({ orderId: z.number() })).query(async ({ input }) => {
      return upgradeErrorsAsBadRequest(() => previewAddons(input.orderId));
    }),
    requestAddon: adminProcedure.input(z.object({
      orderId: z.number(),
      ticketTypeId: z.number(),
      quantity: z.number().int().min(1).max(10),
    })).mutation(async ({ input }) => {
      return upgradeErrorsAsBadRequest(async () => {
        const { addon, created } = await createAddonRequest({ ...input, source: 'admin' });
        return { addonId: addon.id, created, amount: Number(addon.amount), paymentUrl: addon.paymentUrl };
      });
    }),
    sendAddonEmail: adminProcedure.input(z.object({ addonId: z.number() })).mutation(async ({ input }) => {
      return upgradeErrorsAsBadRequest(() => sendAddonRequestEmail(input.addonId));
    }),
    // "Marcar como pagado" (transferencia o efectivo): agrega el extra igual que un
    // pago de Mercado Pago. Exactamente una vez, ver settleAddon.
    markAddonPaid: adminProcedure.input(z.object({ addonId: z.number() })).mutation(async ({ input, ctx }) => {
      return upgradeErrorsAsBadRequest(() => settleAddonAndNotify(input.addonId, { method: 'manual', ip: clientIp(ctx) }));
    }),
    cancelAddon: adminProcedure.input(z.object({ addonId: z.number() })).mutation(async ({ input }) => {
      return upgradeErrorsAsBadRequest(() => cancelAddon(input.addonId));
    }),

    // Recordatorio a quien dejó la compra a medio camino (server/orderReminders.ts).
    // La selección es manual a propósito: nunca "mandar a todos".
    // No hace falta un `listPending`: `listAll` con status='pending' ya trae
    // todas las columnas de la orden, incluidas reminderSentAt/reminderCount.
    sendReminders: adminProcedure.input(z.object({
      orderIds: z.array(z.number()).min(1).max(200),
      customBody: z.string().max(4000).optional(),
    })).mutation(async ({ input }) => {
      return sendPendingReminders(input);
    }),
    generateReminderCopy: adminProcedure.input(z.object({
      idea: z.string().min(5).max(1000),
    })).mutation(async ({ input }) => {
      try {
        return await generateReminderCopy(input.idea);
      } catch (err) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err instanceof Error ? err.message : 'No se pudo generar el texto.' });
      }
    }),
    // Accesos manuales desde /admin (pedido explícito del usuario):
    // invitaciones gratis o accesos ya pagados por transferencia/efectivo
    // directo, sin pasar por Mercado Pago -- misma info del comprador que el
    // checkout público, y el mismo mail final con QR (confirmFreeOrder ya lo
    // usa el checkout público para el caso de descuento 100%).
    createManual: adminProcedure.input(z.object({
      eventSlug: z.string(),
      buyerName: z.string().min(1),
      buyerEmail: z.string().email(),
      buyerPhone: z.string().optional(),
      items: z.array(z.object({
        ticketTypeId: z.number(),
        quantity: z.number().min(1),
        // Monto que el admin escribió a mano para este tipo de entrada
        // (pedido explícito del usuario) -- si no viene, se usa el precio de
        // catálogo/abono Misión 300 por defecto (ver priceManualOrderItems).
        unitPrice: z.number().min(0).optional(),
      })).min(1),
      kind: z.enum(['invitation', 'paid']),
      paymentMethod: z.string().optional(),
      attendeeData: z.string().optional(),
    })).mutation(async ({ input }) => {
      try {
        const result = await db.createManualOrder(input);
        await confirmFreeOrder(result.orderNumber);
        return result;
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo crear el acceso manual.' });
      }
    }),
    listManual: adminReadProcedure.query(async () => {
      return db.listManualOrders();
    }),
    // "Invitación especial instantánea" de Accesos Manuales (pedido explícito
    // del usuario): sin ningún dato salvo la cantidad de personas -- para
    // cuando llega un invitado del dueño a la puerta sin QR. Un solo
    // ticket/QR representa a todas las personas (ver createInstantInvite).
    createInstantInvite: adminProcedure.input(z.object({
      eventSlug: z.string(),
      personas: z.number().int().min(1).max(20),
    })).mutation(async ({ input }) => {
      try {
        return await db.createInstantInvite(input);
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo crear la invitación.' });
      }
    }),
    // "Invitar consumo gratis a staff" de Accesos Manuales (pedido explícito
    // del usuario): el dueño elige un producto de la Carta de la Fiesta,
    // cuántas unidades y para quién es -- la cajera lo ve y lo canjea en /caja.
    createStaffComp: adminProcedure.input(z.object({
      eventSlug: z.string(),
      ticketTypeId: z.number(),
      quantity: z.number().int().min(1).max(20),
      staffName: z.string().min(1),
    })).mutation(async ({ input }) => {
      try {
        return await db.createStaffComp(input);
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo crear la invitación de consumo.' });
      }
    }),
    // Regalos a staff y anfitriones por correo (pedido del dueño): covers, entradas, estacionamiento y tragos de cortesía.
    // Lo de acceso/extra va como invitación gratis (le llega el correo con QR); los tragos de la carta se crean con su
    // código canjeable en la barra. A cada persona le llega un aviso al celular y todo aparece en su app al instante.
    giftToStaff: giftProcedure.input(z.object({
      eventId: z.number(),
      emails: z.array(z.string().email()).min(1).max(40),
      items: z.array(z.object({ ticketTypeId: z.number(), quantity: z.number().int().min(1).max(20) })).min(1).max(12),
    })).mutation(async ({ input, ctx }) => runGift({ eventId: input.eventId, emails: input.emails, items: input.items, actor: ctx.user.email ?? ctx.user.name ?? 'admin', ip: clientIp(ctx) })),
    // Regalar a cualquier cliente (ficha del cliente, buscador «Regalar a…» o un grupo): el mismo envío de siempre
    // (correo con QR + aviso a la app), solo con la clave del dueño. `audience` regala lo mismo a todo un grupo.
    gift: giftProcedure.input(z.object({
      eventId: z.number(),
      emails: z.array(z.string().email()).max(40).optional(),
      audience: couponAudienceInput.optional(),
      items: z.array(z.object({ ticketTypeId: z.number(), quantity: z.number().int().min(1).max(20) })).min(1).max(12),
      reason: z.string().trim().max(200).optional(),
      mode: z.enum(['directo', 'pase']).optional(),
      anyAccess: z.boolean().optional(),
      validDays: z.number().int().min(1).max(365).nullable().optional(),
      message: z.string().max(GIFT_MESSAGE_MAX + 20).optional(),
    })).mutation(async ({ input, ctx }) => {
      let emails = (input.emails ?? []).map((e) => e.trim().toLowerCase());
      if (input.audience) {
        const r = await members.resolveCouponAudience(input.audience);
        if (r.overLimit) throw new TRPCError({ code: 'BAD_REQUEST', message: 'El grupo es demasiado grande para un solo envío: acótalo.' });
        emails = [...emails, ...r.customers.map((c) => c.email.toLowerCase())];
      }
      emails = Array.from(new Set(emails));
      if (emails.length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Elige al menos a una persona.' });
      return runGift({ eventId: input.eventId, emails, items: input.items, reason: input.reason, mode: input.mode, anyAccess: input.anyAccess, validDays: input.validDays, message: input.message, actor: ctx.user.email ?? ctx.user.name ?? 'admin', ip: clientIp(ctx) });
    }),
    // Los pases regalados de un evento y su estado (disponible / usado / vencido / anulado).
    listGifts: adminReadProcedure.input(z.object({ eventId: z.number() })).query(({ input }) => listGiftPasses(input.eventId)),
    cancelGift: giftProcedure.input(z.object({ creditId: z.number() })).mutation(async ({ input, ctx }) => {
      try { await cancelGiftPass(input.creditId, { by: ctx.user.email ?? ctx.user.name ?? 'admin', ip: clientIp(ctx) }); } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo anular el pase.' });
      }
      return { ok: true as const };
    }),
    // ¿Esta sesión puede dar regalos? (para mostrar u ocultar los botones).
    canGift: adminReadProcedure.query(({ ctx }) => ({ can: canGift(ctx.user) })),
    listStaffComps: adminReadProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return db.listStaffComps(input.eventId);
    }),
    // Eliminar una compra (pedido explícito del usuario): irreversible, la
    // confirmación con ventana de diálogo vive en el admin, acá solo se
    // ejecuta el borrado en cascada.
    delete: adminPasswordProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      // La foto se toma ANTES de borrar: después no queda nada que mirar, y
      // reconstruir una venta desaparecida es justo lo que no se podía hacer.
      const before = await db.getOrderById(input.id);
      const result = await db.deleteOrderCascade(input.id);
      await db.recordAdminAudit({ action: 'orders.delete', targetType: 'order', targetId: input.id, eventId: before?.eventId ?? null, payload: before ?? null, ip: clientIp(ctx) });
      return result;
    }),
  }),

  mission300: router({
    status: adminReadProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return getMission300Status(input.eventId);
    }),
    evaluate: adminProcedure.input(z.object({ eventId: z.number() })).mutation(async ({ input }) => {
      return evaluateMission300(input.eventId);
    }),
    // Contador público de Home (pedido explícito del usuario): cuántas
    // personas de abonos de Misión 300 todavía NO están resueltas (ni
    // "aprobadas del todo"), para que el contador público las reste y solo
    // muestre lo que ya está confirmado -- sin datos sensibles, solo un número.
    pendingPersonas: publicProcedure.input(z.object({ slug: z.string() })).query(async ({ input }) => {
      const event = await db.getEventBySlug(input.slug);
      if (!event) return { personas: 0 };
      return { personas: await db.getUnresolvedDepositPersonas(event.id) };
    }),
  }),

  tickets: router({
    // Página pública "Mi entrada" (/verificar/:ticketCode) — de solo lectura,
    // el ticketCode ya funciona como token portador (viene del QR/email).
    getByCode: publicProcedure.input(z.object({ ticketCode: z.string() })).query(async ({ input }) => {
      return db.getTicketByCode(input.ticketCode);
    }),
  }),

  // --- Puerta: el anfitrión en la entrada del estacionamiento ---
  // Pantalla aparte de /caja a propósito: el anfitrión no es cajero, no
  // debería ver el menú de venta, y escanea con su propio teléfono. Lo
  // único que puede hacer con esta sesión es marcar entradas.
  // El botón «Llamar a los organizadores» de arriba de todas las pantallas de trabajo: llega al celular del administrador y de
  // los supervisores. Cualquier persona con su PIN adentro puede usarlo; un aviso cada ~20 s por persona.
  terminal: router({
    call: anyOperatorProcedure.input(z.object({
      area: z.enum(['caja', 'puerta', 'cocina', 'guardarropia', 'barra']),
      reason: z.enum(STAFF_CALL_KEYS),
      note: z.string().max(STAFF_CALL_NOTE_MAX * 2).nullish(),
    })).mutation(async ({ input, ctx }) => {
      const key = `staff-call:${ctx.operator.operatorId}`;
      if (!(await db.checkIpRateLimit(key))) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Ya avisaste hace un momento. Espera unos segundos.' });
      await db.recordIpAttempt(key, 1, STAFF_CALL_COOLDOWN_MS);
      const rawDb = await db.getDb();
      if (!rawDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Base de datos no disponible' });
      const eventId = ctx.operator.eventId ?? (await db.getActiveEventForCaja())?.id ?? null;
      const r = await callOrganizers(rawDb, { eventId, area: input.area, reason: input.reason, note: input.note, operatorId: ctx.operator.operatorId, operatorName: ctx.operator.name ?? 'Alguien del equipo' });
      return { ok: true as const, supervisors: r.supervisors };
    }),
  }),

  puerta: router({
    // Público como el de caja: solo devuelve nombres y roles, nunca PINs.
    // La puerta no exige dispositivo enrolado (doorProcedure), así que no hay
    // un eventId de contexto -- se usa la misma heurística de "evento en
    // curso" que el resto de estas pantallas sin device.
    listOperators: publicProcedure.query(async () => {
      const event = await db.getActiveEventForCaja();
      if (!event) return [];
      const all = await db.listActiveOperatorsPublic(event.id);
      return all.filter((o: any) => o.role === 'acceso' || o.role === 'supervisor' || o.role === 'admin');
    }),

    login: publicProcedure.input(z.object({ operatorId: z.number(), pin: z.string().min(4).max(8) }))
      .mutation(async ({ input, ctx }) => {
        const operator = await verifyDoorPinOrThrow(ctx, input.operatorId, input.pin);
        const sessionToken = await signOperatorSession({ operatorId: operator.id, role: operator.role, name: operator.name });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(CAJA_COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: CAJA_SESSION_MS });
        return { id: operator.id, name: operator.name, role: operator.role };
      }),

    // Cerrar sesión / cambiar de persona en el mismo celular.
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(CAJA_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),

    me: publicProcedure.query(({ ctx }) => ctx.operator),

    /* El evento sale del operador que inició sesión (`operators.eventId`),
     * no de la heurística "el evento publicado con fecha más cercana a
     * ahora". Con dos eventos publicados a la vez esa heurística puede
     * apuntar al equivocado y un check-in queda cargado a la fiesta que no
     * es. /caja ya lo había resuelto usando el evento del dispositivo
     * enrolado; estas pantallas no tienen dispositivo a propósito (el
     * anfitrión usa su propio teléfono), pero el operador sí trae su evento.
     * La heurística queda solo como respaldo para un operador viejo sin
     * evento asignado. */
    activeEvent: doorProcedure.query(async ({ ctx }) => {
      if (ctx.operator?.eventId) return (await db.getEventById(ctx.operator.eventId)) ?? undefined;
      return db.getActiveEventForCaja();
    }),

    // Mismo snapshot que la caja: la puerta lo guarda en el mismo IndexedDB
    // y por eso funciona sin señal.
    snapshot: doorProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      const snapshot = await db.getCajaSnapshot(input.eventId);
      if (!snapshot) return snapshot;
      // Precio del estacionamiento y lo del local por auto: la puerta cobra
      // estacionamiento y tiene que mostrar el monto antes de cobrar.
      // El staff del evento con su credencial: la puerta los reconoce aunque no haya señal.
      const [parking, staff] = await Promise.all([db.getParkingPricing(input.eventId), staffPortal.staffForDoor(input.eventId).catch(() => [])]);
      const contacts = await staffPortal.getEventStaffInfo(input.eventId).then((i) => i.contacts).catch(() => []);
      return { ...snapshot, parking, staff, contacts };
    }),

    // Credencial del staff escaneada en la puerta: queda anotada su llegada.
    staffArrival: doorProcedure.input(z.object({ eventId: z.number().int().positive(), code: z.string().max(64) })).mutation(({ input }) => staffPortal.recordStaffArrival(input.eventId, input.code)),

    checkin: doorProcedure.input(z.object({
      opId: z.string(),
      eventId: z.number(),
      ticketCode: z.string().min(1),
      clientAt: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await db.getDb();
      if (!rawDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Base de datos no disponible' });
      const res = await checkInTicket(rawDb, {
        opId: input.opId,
        ticketCode: input.ticketCode,
        eventId: input.eventId,
        operatorId: ctx.operator.operatorId,
        clientAt: new Date(input.clientAt),
      });
      // Sello de la fiesta en la app: si completa la tarjeta, el Dúo gratis queda listo y llega el aviso.
      if (res.result === 'applied') {
        void refreshStampsForTicket(input.ticketCode);
        // Si se inscribió antes en Playmatch, su perfil se activa y le llega el aviso.
        void activatePlaymatchForTicket(input.ticketCode);
      }
      return res;
    }),

    // Aviso urgente de la puerta a los organizadores: queda en el ledger y les llega un push al instante. Un aviso cada ~20 s por persona.
    alert: doorProcedure.input(z.object({
      opId: z.string().min(8).max(64), eventId: z.number(), reason: z.enum(DOOR_ALERT_KEYS),
      note: z.string().max(DOOR_ALERT_NOTE_MAX * 2).nullish(), ticketCode: z.string().max(40).nullish(), buyerName: z.string().max(120).nullish(),
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await db.getDb();
      if (!rawDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Base de datos no disponible' });
      const key = `door-alert:${ctx.operator.operatorId}`;
      if (!(await db.checkIpRateLimit(key))) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Ya avisaste hace un momento. Espera unos segundos.' });
      await db.recordIpAttempt(key, 1, DOOR_ALERT_COOLDOWN_MS);
      const push = await recordDoorAlert(rawDb, {
        opId: input.opId, eventId: input.eventId, operatorId: ctx.operator.operatorId, operatorName: ctx.operator.name ?? 'La puerta',
        reason: input.reason, note: input.note, ticketCode: input.ticketCode, buyerName: input.buyerName, clientAt: new Date(),
      });
      // Al administrador y también a los supervisores.
      await notifyOrganizers(input.eventId, push);
      return { ok: true as const };
    }),

    // Retirar y vetar desde la puerta: se escaneó el QR, se eligió un motivo. Rige al instante (lista de bloqueados, entradas
    // anuladas, fuera de Playmatch) y queda pendiente de que el dueño lo confirme; a él le llega el aviso al celular.
    veto: doorProcedure.input(z.object({
      opId: z.string().min(8).max(64), eventId: z.number(), ticketCode: z.string().min(1).max(40),
      reasonKey: z.enum(['agresion', 'normas', 'drogas', 'otro']), note: z.string().max(VETO_NOTE_MAX + 20).nullish(),
    })).mutation(async ({ input, ctx }) => {
      const key = `door-veto:${ctx.operator.operatorId}`;
      if (!(await db.checkIpRateLimit(key))) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Acabas de vetar a alguien. Espera unos segundos.' });
      await db.recordIpAttempt(key, 1, 8_000);
      try {
        return await vetoSvc.vetoTicket({ ticketCode: input.ticketCode, reasonKey: input.reasonKey, note: input.note, by: { kind: 'puerta', name: ctx.operator.name ?? 'La puerta' }, ip: clientIp(ctx) });
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo vetar.' });
      }
    }),

    // Vaciado de la cola offline. Solo acepta check-in y cobro de
    // estacionamiento: la puerta no vende de la carta ni canjea otros
    // extras, aunque comparta la cola con la caja.
    sync: doorProcedure.input(z.object({
      eventId: z.number(),
      ops: z.array(z.discriminatedUnion('type', [
        z.object({ type: z.literal('checkin'), opId: z.string(), ticketCode: z.string(), clientAt: z.string(), idVerified: z.boolean().optional() }),
        z.object({
          type: z.literal('parking_paid'), opId: z.string(), ticketCode: z.string(),
          // Qué estacionamiento se cobró (normal o VIP). Opcional: los cobros
          // anotados antes de que existiera esta elección no lo traen.
          ticketTypeId: z.number().optional(),
          paymentMethod: z.enum(['efectivo', 'debito', 'credito']), clientAt: z.string(),
        }),
      ])).max(50),
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await db.getDb();
      if (!rawDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Base de datos no disponible' });

      const results: Record<string, { result: string; conflictNote?: string }> = {};
      for (const op of input.ops) {
        try {
          if (op.type === 'checkin') {
            results[op.opId] = await checkInTicket(rawDb, {
              opId: op.opId, ticketCode: op.ticketCode, eventId: input.eventId,
              operatorId: ctx.operator.operatorId, clientAt: new Date(op.clientAt), idVerified: op.idVerified,
            });
          } else {
            results[op.opId] = await sellParkingAtDoor(rawDb, {
              opId: op.opId, ticketCode: op.ticketCode, eventId: input.eventId,
              paymentMethod: op.paymentMethod, ticketTypeId: op.ticketTypeId, operatorId: ctx.operator.operatorId, clientAt: new Date(op.clientAt),
            });
          }
        } catch (err) {
          results[op.opId] = { result: 'rejected', conflictNote: friendlySyncErrorMessage(err, op.opId) };
        }
      }
      return results;
    }),
  }),

  // --- Cocina: la pantalla que recibe los pedidos de comida de /caja ---
  // Pantalla propia, aparte de /caja y /puerta: el equipo de cocina no
  // vende ni marca entradas, solo prepara y entrega. A diferencia de esas
  // dos, esta pantalla SÍ necesita red -- el pedido nace en otra tablet
  // (la caja) y no hay forma de que cocina se entere sin consultar al
  // servidor, así que no tiene sentido una cola offline acá.
  // Conteo de barra del staff (inicial y de cierre), desde /barra: el inventario NO se cuenta en /caja, que solo lleva la
  // plata. Sesión por PIN de operador sin dispositivo enrolado, como cocina; el evento sale del operador.
  barra: router({
    listOperators: publicProcedure.query(async () => {
      const event = await db.getActiveEventForCaja();
      if (!event) return [];
      const all = await db.listActiveOperatorsPublic(event.id);
      return all.filter((o: any) => o.role === 'barra' || o.role === 'supervisor' || o.role === 'admin');
    }),

    login: publicProcedure.input(z.object({ operatorId: z.number(), pin: z.string().min(4).max(8) }))
      .mutation(async ({ input, ctx }) => {
        const operator = await verifyBarraPinOrThrow(ctx, input.operatorId, input.pin);
        const sessionToken = await signOperatorSession({ operatorId: operator.id, role: operator.role, name: operator.name });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(CAJA_COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: CAJA_SESSION_MS });
        return { id: operator.id, name: operator.name, role: operator.role };
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(CAJA_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),

    me: publicProcedure.query(({ ctx }) => ctx.operator),

    // El evento del operador (respaldo para un operador viejo sin evento: el activo de la caja).
    activeEvent: barraProcedure.query(async ({ ctx }) => {
      if (ctx.operator?.eventId) return (await db.getEventById(ctx.operator.eventId)) ?? undefined;
      return db.getActiveEventForCaja();
    }),

    // Las dos tareas de la noche con su ventana horaria y quién ya las hizo.
    tareas: barraProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => barraTareasDelEvento(input.eventId)),

    estado: barraProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      const estado = await insumoSvc.estadoBarra(input.eventId);
      if (!estado.ready) return { ready: false as const, insumos: [], ultimaApertura: null, ultimoCierre: null };
      const [ultimaApertura, ultimoCierre] = await Promise.all([
        insumoSvc.ultimoConteo(input.eventId, 'apertura'), insumoSvc.ultimoConteo(input.eventId, 'cierre'),
      ]);
      return { ready: true as const, insumos: estado.insumos, ultimaApertura, ultimoCierre };
    }),

    conteo: barraProcedure.input(z.object({
      eventId: z.number(), kind: z.enum(['apertura', 'cierre']),
      lines: z.array(z.object({
        insumoId: z.number(),
        closed: z.array(z.object({ size: z.number().int().min(1).max(1_000_000), count: z.number().int().min(0).max(10000) })).max(20).optional(),
        open: z.array(z.object({ size: z.number().int().min(1).max(1_000_000), portions: z.number().min(0).max(10) })).max(50).optional(),
      })).min(1).max(500),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.operator.eventId && ctx.operator.eventId !== input.eventId) throw new TRPCError({ code: 'FORBIDDEN', message: 'Tu acceso es de otro evento' });
      const event = await db.getEventById(input.eventId);
      if (!event) throw new TRPCError({ code: 'NOT_FOUND', message: 'No encontramos el evento' });
      const isChief = ctx.operator.role === 'supervisor' || ctx.operator.role === 'admin';
      const test = await db.getEventBySlug('pruebas-caja');
      // Quien no es supervisor/admin solo cuenta dentro de la ventana y una vez por noche; el evento de pruebas no tiene límites.
      if (!isChief && event.id !== test?.id) {
        const ventana = barraConteoVentana(event)[input.kind];
        if (ventana !== 'abierta') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: ventana === 'aun_no'
            ? (input.kind === 'apertura' ? 'Todavía no es el día del evento' : 'El inventario de cierre se abre cuando termina la fiesta')
            : (input.kind === 'apertura' ? 'El conteo inicial ya cerró (la fiesta ya empezó). Avisa a un supervisor.' : 'El inventario de cierre ya cerró. Avisa a un supervisor.') });
        }
        const ya = await insumoSvc.ultimoConteo(input.eventId, input.kind);
        if (ya) throw new TRPCError({ code: 'BAD_REQUEST', message: `Ya lo hizo ${ya.operatorName ?? 'alguien de la barra'}. Si hay que corregirlo, avisa a un supervisor.` });
      }
      try {
        const result = await insumoSvc.crearConteo({
          eventId: input.eventId, registerId: null, shiftId: null, kind: input.kind,
          operatorId: ctx.operator.operatorId, operatorName: ctx.operator.name, lines: input.lines,
        });
        if (input.kind === 'cierre' && !result.test) await alertConteoDescuadre(input.eventId, result.conteoId, ctx.operator.name, result.forAlerts);
        return { conteoId: result.conteoId, test: result.test, lines: result.lines };
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo guardar el conteo' });
      }
    }),
  }),

  cocina: router({
    listOperators: publicProcedure.query(async () => {
      const event = await db.getActiveEventForCaja();
      if (!event) return [];
      const all = await db.listActiveOperatorsPublic(event.id);
      return all.filter((o: any) => o.role === 'cocina' || o.role === 'supervisor' || o.role === 'admin');
    }),

    login: publicProcedure.input(z.object({ operatorId: z.number(), pin: z.string().min(4).max(8) }))
      .mutation(async ({ input, ctx }) => {
        const operator = await verifyKitchenPinOrThrow(ctx, input.operatorId, input.pin);
        const sessionToken = await signOperatorSession({ operatorId: operator.id, role: operator.role, name: operator.name });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(CAJA_COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: CAJA_SESSION_MS });
        return { id: operator.id, name: operator.name, role: operator.role };
      }),

    // Cerrar sesión / cambiar de persona en el mismo celular.
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(CAJA_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),

    me: publicProcedure.query(({ ctx }) => ctx.operator),

    /* El evento sale del operador que inició sesión (`operators.eventId`),
     * no de la heurística "el evento publicado con fecha más cercana a
     * ahora". Con dos eventos publicados a la vez esa heurística puede
     * apuntar al equivocado y un check-in queda cargado a la fiesta que no
     * es. /caja ya lo había resuelto usando el evento del dispositivo
     * enrolado; estas pantallas no tienen dispositivo a propósito (el
     * anfitrión usa su propio teléfono), pero el operador sí trae su evento.
     * La heurística queda solo como respaldo para un operador viejo sin
     * evento asignado. */
    activeEvent: kitchenProcedure.query(async ({ ctx }) => {
      if (ctx.operator?.eventId) return (await db.getEventById(ctx.operator.eventId)) ?? undefined;
      return db.getActiveEventForCaja();
    }),

    // Polling cada 4s desde el cliente -- pendientes/aprobadas más viejas
    // primero, y las entregadas de la última hora aparte (para "deshacer").
    list: kitchenProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return listKitchenTickets(input.eventId);
    }),

    update: kitchenProcedure.input(z.object({
      opId: z.string(),
      eventId: z.number(),
      ticketNumber: z.string(),
      to: z.enum(['pendiente', 'aprobado', 'entregado']),
      clientAt: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await db.getDb();
      if (!rawDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Base de datos no disponible' });
      return updateKitchenTicket(rawDb, {
        opId: input.opId,
        eventId: input.eventId,
        ticketNumber: input.ticketNumber,
        operatorId: ctx.operator.operatorId,
        clientAt: new Date(input.clientAt),
        to: input.to,
      });
    }),

    // Porciones disponibles por producto (docs/ARQUITECTURA-CAJA.md §12):
    // cocina carga cuánto hay de cada opción y la cajera solo puede vender
    // hasta ese tope -- mismo stock/soldCount que ya usa /caja, no una
    // tabla paralela.
    products: kitchenProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return listKitchenProducts(input.eventId);
    }),

    updateStock: kitchenProcedure.input(z.object({
      productId: z.number(),
      eventId: z.number(),
      totalStock: z.number().min(0),
    })).mutation(async ({ input, ctx }) => {
      return updateKitchenProductStock(input.productId, input.eventId, input.totalStock, ctx.operator.operatorId);
    }),

    // Botón de emergencia: agotar/reponer un producto sin tener que calcular
    // porciones exactas -- bloquea la venta de verdad en /caja (ver
    // getCajaSnapshot).
    toggleSoldOut: kitchenProcedure.input(z.object({
      productId: z.number(),
      eventId: z.number(),
      soldOut: z.boolean(),
    })).mutation(async ({ input }) => {
      return toggleKitchenProductSoldOut(input.productId, input.eventId, input.soldOut);
    }),
  }),

  // Pantalla propia de guardarropía: recibe/entrega prendas ya cobradas
  // en /caja. Mismo criterio que cocina -- sin cola offline, la prenda
  // nace en otra tablet y no hay forma de enterarse sin consultar al
  // servidor.
  guardarropia: router({
    listOperators: publicProcedure.query(async () => {
      const event = await db.getActiveEventForCaja();
      if (!event) return [];
      const all = await db.listActiveOperatorsPublic(event.id);
      return all.filter((o: any) => o.role === 'guardarropia' || o.role === 'supervisor' || o.role === 'admin');
    }),

    login: publicProcedure.input(z.object({ operatorId: z.number(), pin: z.string().min(4).max(8) }))
      .mutation(async ({ input, ctx }) => {
        const operator = await verifyGuardarropiaPinOrThrow(ctx, input.operatorId, input.pin);
        const sessionToken = await signOperatorSession({ operatorId: operator.id, role: operator.role, name: operator.name });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(CAJA_COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: CAJA_SESSION_MS });
        return { id: operator.id, name: operator.name, role: operator.role };
      }),

    // Cerrar sesión / cambiar de persona en el mismo celular.
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(CAJA_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),

    me: publicProcedure.query(({ ctx }) => ctx.operator),

    /* El evento sale del operador que inició sesión (`operators.eventId`),
     * no de la heurística "el evento publicado con fecha más cercana a
     * ahora". Con dos eventos publicados a la vez esa heurística puede
     * apuntar al equivocado y un check-in queda cargado a la fiesta que no
     * es. /caja ya lo había resuelto usando el evento del dispositivo
     * enrolado; estas pantallas no tienen dispositivo a propósito (el
     * anfitrión usa su propio teléfono), pero el operador sí trae su evento.
     * La heurística queda solo como respaldo para un operador viejo sin
     * evento asignado. */
    activeEvent: guardarropiaProcedure.query(async ({ ctx }) => {
      if (ctx.operator?.eventId) return (await db.getEventById(ctx.operator.eventId)) ?? undefined;
      return db.getActiveEventForCaja();
    }),

    // Polling cada 4s -- trae todas las prendas del evento, el cliente
    // arma la cola de "recién llegadas" y el buscador localmente.
    list: guardarropiaProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return listLockerItems(input.eventId);
    }),

    update: guardarropiaProcedure.input(z.object({
      opId: z.string(),
      eventId: z.number(),
      tagNumber: z.string(),
      to: z.enum(['pendiente', 'guardado', 'parcial', 'retirado']),
      // Qué sacaron, en un retiro parcial.
      note: z.string().max(PARTIAL_ITEM_MAX + 20).nullish(),
      clientAt: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await db.getDb();
      if (!rawDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Base de datos no disponible' });
      return updateLockerItem(rawDb, {
        note: input.note,
        opId: input.opId,
        eventId: input.eventId,
        tagNumber: input.tagNumber,
        operatorId: ctx.operator.operatorId,
        clientAt: new Date(input.clientAt),
        to: input.to,
      });
    }),
  }),

  // --- Caramelo: la fiesta dentro del celular ---
  // Todo público porque el `ticketCode` ES el token (igual que la página de
  // la entrada): no hay cuentas ni contraseñas. Cada llamada revalida las
  // tres condiciones desde cero contra la base -- esconder un botón en el
  // cliente no protege nada.
  party: router({
    resolveEntryCode: publicProcedure.input(z.object({ code: z.string() })).query(async ({ input }) => {
      const ticketCode = await db.resolvePartyEntryCode(input.code);
      return { ticketCode };
    }),
    getSession: publicProcedure.input(z.object({ ticketCode: z.string() })).query(async ({ input }) => {
      const actor = await db.getPartyActor(input.ticketCode);
      if (!actor) return { denial: 'sin_ticket' as const, preRegister: false, event: null, profile: null, config: null };

      const now = new Date();
      const denial = partyEntryDenial(actor.ticket, actor.event, now);
      return {
        denial,
        // Antes de entrar: puede dejar listo su perfil y se activa al escanear la entrada.
        preRegister: !!denial && canPreRegister(actor.ticket, actor.event, now),
        event: {
          id: actor.event.id,
          title: actor.event.title,
          eventDate: actor.event.eventDate,
          doorsOpen: actor.event.doorsOpen,
          eventEnd: actor.event.eventEnd,
        },
        // Lo que el administrador prende y apaga en vivo, y los precios (shared/playmatchMarket.ts).
        config: publicPlaymatchConfig(await db.getPartyConfig(actor.event.id)),
        profile: actor.profile
          ? await (async (p) => {
            const photoCount = await db.countPartyPhotos(p.id);
            return {
              id: p.id, alias: p.alias, gender: p.gender, avatarId: p.avatarId, zone: p.zone, swipeEnabled: !!p.swipeEnabled,
              hasPhoto: photoCount > 0, photoCount, lookingFor: parseLookingFor(p.lookingFor), costume: p.costume ?? null,
              pairType: p.pairType ?? null, orientation: p.orientation ?? null, relationStyle: p.relationStyle ?? null, intents: parseIntents(p.intents),
            };
          })(actor.profile)
          : null,
      };
    }),

    createProfile: publicProcedure.input(z.object({
      ticketCode: z.string(),
      alias: z.string(),
      gender: z.enum(PARTY_GENDERS),
      avatarId: z.number().int().min(1).max(AVATARS_PER_GENDER),
      zone: z.enum(PARTY_ZONES),
      lookingFor: z.array(z.enum([...LOOKING_FOR_KEYS, 'pareja'])).min(1).max(7).optional(),
      // Opcionales (null = «Prefiero no decir»).
      pairType: z.enum(PAIR_TYPES).nullish(),
      orientation: z.enum(ORIENTATIONS).nullish(),
      relationStyle: z.enum(RELATION_STYLES).nullish(),
      intents: z.array(z.enum(INTENTS)).max(MAX_INTENTS).optional(),
      costume: z.string().max(80).optional(),
      acceptedRules: z.literal(true, { message: 'Para entrar tienes que aceptar las reglas de la casa' }),
    })).mutation(async ({ input }) => {
      const actor = await requirePartyRegistrant(input.ticketCode);
      if (actor.profile) return { id: actor.profile.id };

      // El alias y el disfraz los ve toda la fiesta: se validan en el servidor, no solo en
      // el formulario.
      const check = sanitizeAlias(input.alias);
      if (!check.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: check.reason });
      const costume = sanitizeCostume(input.costume);
      if (!costume.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: costume.reason });

      const profile = await db.createPartyProfile({
        eventId: actor.event.id,
        ticketId: actor.ticket.id,
        alias: check.alias,
        gender: input.gender,
        avatarId: input.avatarId,
        zone: input.zone,
        active: actor.inside ? 1 : 0,
        lookingFor: serializeLookingFor(input.lookingFor ?? DEFAULT_LOOKING_FOR),
        costume: costume.costume,
        pairType: input.gender === 'pareja' ? input.pairType ?? null : null,
        orientation: input.orientation ?? null,
        relationStyle: input.relationStyle ?? null,
        intents: serializeIntents(input.intents ?? []),
      });
      return { id: profile!.id };
    }),

    // Cambiar alias, género, avatar, a quién busca o el disfraz: antes de la fiesta (inscripción anticipada) o adentro.
    updateProfile: publicProcedure.input(z.object({
      ticketCode: z.string(),
      alias: z.string(),
      gender: z.enum(PARTY_GENDERS),
      avatarId: z.number().int().min(1).max(AVATARS_PER_GENDER),
      lookingFor: z.array(z.enum([...LOOKING_FOR_KEYS, 'pareja'])).min(1).max(7).optional(),
      // Opcionales (null = «Prefiero no decir»).
      pairType: z.enum(PAIR_TYPES).nullish(),
      orientation: z.enum(ORIENTATIONS).nullish(),
      relationStyle: z.enum(RELATION_STYLES).nullish(),
      intents: z.array(z.enum(INTENTS)).max(MAX_INTENTS).optional(),
      costume: z.string().max(80).optional(),
    })).mutation(async ({ input }) => {
      const actor = await requirePartyRegistrant(input.ticketCode);
      if (!actor.profile) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Todavía no creaste tu perfil' });
      const check = sanitizeAlias(input.alias);
      if (!check.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: check.reason });
      const costume = sanitizeCostume(input.costume);
      if (!costume.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: costume.reason });
      await db.updatePartyProfile(actor.profile.id, {
        alias: check.alias, gender: input.gender, avatarId: input.avatarId,
        ...(input.lookingFor ? { lookingFor: serializeLookingFor(input.lookingFor) } : {}),
        ...(input.costume !== undefined ? { costume: costume.costume } : {}),
        // Las apps viejas no mandan estos campos: solo se tocan si vienen.
        ...(input.pairType !== undefined || input.gender !== 'pareja' ? { pairType: input.gender === 'pareja' ? input.pairType ?? null : null } : {}),
        ...(input.orientation !== undefined ? { orientation: input.orientation } : {}),
        ...(input.relationStyle !== undefined ? { relationStyle: input.relationStyle } : {}),
        ...(input.intents !== undefined ? { intents: serializeIntents(input.intents) } : {}),
      });
      return { ok: true as const };
    }),

    listMansion: publicProcedure.input(z.object({ ticketCode: z.string() })).query(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      return db.listPartyMansion(actor.profile.id, actor.event.id);
    }),

    setZone: publicProcedure.input(z.object({ ticketCode: z.string(), zone: z.enum(PARTY_ZONES) }))
      .mutation(async ({ input }) => {
        const actor = await requirePartyProfile(input.ticketCode);
        await db.updatePartyProfile(actor.profile.id, { zone: input.zone });
        return { ok: true };
      }),

    touch: publicProcedure.input(z.object({ ticketCode: z.string(), targetProfileId: z.number() }))
      .mutation(async ({ input }) => {
        const actor = await requirePartyProfile(input.ticketCode);
        const res = await db.touchPartyProfile(actor.profile.id, input.targetProfileId, actor.event.id);
        // Sin Super Likes: el cliente abre la compra (PRECONDITION_FAILED + «sin_super_likes»), no un error.
        if (!res.ok && res.code === 'needs_purchase') throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'sin_super_likes' });
        if (!res.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: res.reason });
        // El Super Like sí se entera (a diferencia del ♥): le llega un aviso.
        const otherTicketCode = await db.getPartyProfileTicketCode(input.targetProfileId);
        if (otherTicketCode) {
          await sendPushToProfile(input.targetProfileId, res.status === 'accepted'
            ? { title: '💘 ¡Hicieron match!', body: `Tú y ${actor.profile.alias} se gustaron en Playmatch`, url: `/fiesta/${otherTicketCode}` }
            : { title: '⭐ Te mandaron un Super Like', body: `${actor.profile.alias} quiere conocerte en Playmatch`, url: `/fiesta/${otherTicketCode}` });
        }
        return res;
      }),

    // --- Super Likes pagados y «Ver quién me dio ♥» ---
    // Cuántos Super Likes tiene, lo que se le ofrece comprar y con qué puede pagar (Playcoins y saldo).
    superLikeStatus: publicProcedure.input(z.object({ ticketCode: z.string() })).query(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      const status = await playmatch.superLikeStatus(actor.profile, input.ticketCode);
      if (!status) throw new TRPCError({ code: 'NOT_FOUND', message: 'No encontramos tu perfil' });
      return status;
    }),
    // Comprar 1 Super Like o el pack. `opId` lo genera el celular por toque: reintentar no cobra dos veces.
    superLikeBuy: publicProcedure.input(z.object({ ticketCode: z.string(), quantity: z.number().int().min(1).max(50), opId: z.string().min(8).max(30) }))
      .mutation(async ({ input }) => {
        const actor = await requirePartyProfile(input.ticketCode);
        const ipKey = `party-buy:${actor.profile.id}`;
        if (!(await db.checkIpRateLimit(ipKey))) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Espera un momento antes de volver a comprar.' });
        await db.recordIpAttempt(ipKey, 12, 5 * 60 * 1000);
        const res = await playmatch.buySuperLikes({ profile: actor.profile, ticketCode: input.ticketCode, quantity: input.quantity, opId: input.opId });
        if (!res.ok && res.code !== 'saldo') throw new TRPCError({ code: 'BAD_REQUEST', message: res.reason });
        return res;
      }),
    // La cantidad de ♥ que me dieron (siempre) y quiénes, si ya pagó el desbloqueo de esta noche.
    likesForMe: publicProcedure.input(z.object({ ticketCode: z.string() })).query(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      return playmatch.listLikesForMe(actor.profile);
    }),
    likesUnlock: publicProcedure.input(z.object({ ticketCode: z.string(), opId: z.string().min(8).max(30) })).mutation(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      const ipKey = `party-buy:${actor.profile.id}`;
      if (!(await db.checkIpRateLimit(ipKey))) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Espera un momento antes de volver a intentar.' });
      await db.recordIpAttempt(ipKey, 12, 5 * 60 * 1000);
      const res = await playmatch.unlockLikes({ profile: actor.profile, ticketCode: input.ticketCode, opId: input.opId });
      if (!res.ok && res.code !== 'saldo') throw new TRPCError({ code: 'BAD_REQUEST', message: res.reason });
      return res;
    }),
    // La galería de disfraces para votar (y el podio, cuando el administrador lo revela).
    costumeGallery: publicProcedure.input(z.object({ ticketCode: z.string() })).query(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      const gallery = await playmatch.costumeGallery(actor.profile);
      if (!gallery) throw new TRPCError({ code: 'NOT_FOUND', message: 'No se pudo cargar' });
      return gallery;
    }),

    respondTouch: publicProcedure.input(z.object({ ticketCode: z.string(), connectionId: z.number(), accept: z.boolean() }))
      .mutation(async ({ input }) => {
        const actor = await requirePartyProfile(input.ticketCode);
        const res = await db.respondToPartyTouch(actor.profile.id, input.connectionId, input.accept);
        if (!res.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: res.reason });
        return res;
      }),

    getMessages: publicProcedure.input(z.object({ ticketCode: z.string(), connectionId: z.number() }))
      .query(async ({ input }) => {
        const actor = await requirePartyProfile(input.ticketCode);
        const res = await db.listPartyMessages(actor.profile.id, input.connectionId);
        if (!res) throw new TRPCError({ code: 'FORBIDDEN', message: 'Esta conversación no está abierta' });
        return res;
      }),

    sendMessage: publicProcedure.input(z.object({ ticketCode: z.string(), connectionId: z.number(), body: z.string() }))
      .mutation(async ({ input }) => {
        const actor = await requirePartyProfile(input.ticketCode);
        const check = sanitizeMessage(input.body);
        if (!check.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: check.reason });

        const res = await db.sendPartyMessage(actor.profile.id, input.connectionId, check.body);
        if (!res.ok) throw new TRPCError({ code: 'FORBIDDEN', message: res.reason });

        // No se manda el contenido del mensaje en la notificación (privacidad) --
        // solo avisa que llegó algo nuevo, con link de vuelta al chat.
        const otherTicketCode = await db.getPartyProfileTicketCode(res.otherId);
        if (otherTicketCode) {
          await sendPushToProfile(res.otherId, {
            title: '💌 Nuevo mensaje',
            body: `${actor.profile.alias} te escribió en Playmatch`,
            url: `/fiesta/${otherTicketCode}`,
          });
        }
        return { ok: true };
      }),

    // --- Foto del swipe (la imagen se sirve por /api/party/photo, no por tRPC) ---
    // Hasta 3 fotos. Se pueden subir desde la inscripción anticipada (con la entrada comprada):
    // nadie más las ve hasta que escanean la entrada (ver /api/party/photo).
    uploadPhoto: publicProcedure.input(z.object({
      ticketCode: z.string(),
      // JPEG en base64: ~200KB como mucho, validado de nuevo acá.
      photoBase64: z.string().max(400_000),
      position: z.number().int().min(0).max(MAX_PARTY_PHOTOS - 1).optional(),
    })).mutation(async ({ input }) => {
      const actor = await requirePartyPhotoOwner(input.ticketCode);
      const bytes = Buffer.from(input.photoBase64, 'base64');
      const check = validatePhotoBytes(bytes);
      if (!check.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: check.reason });
      const position = await db.savePartyPhoto(actor.profile.id, actor.event.id, bytes, input.position);
      if (position === null) throw new TRPCError({ code: 'BAD_REQUEST', message: `Puedes tener hasta ${MAX_PARTY_PHOTOS} fotos` });
      // Su primera foto lo mete al juego: a quienes tienen mucha afinidad con esta persona les llega un aviso (sin decir quién es).
      if (!actor.profile.swipeEnabled && actor.profile.active) void playmatch.notifyAffinityArrival(actor.profile.id);
      return { ok: true, position };
    }),
    // Sin `position` borra todas (salir del swipe de una).
    deletePhoto: publicProcedure.input(z.object({ ticketCode: z.string(), position: z.number().int().min(0).max(MAX_PARTY_PHOTOS - 1).optional() })).mutation(async ({ input }) => {
      const actor = await requirePartyPhotoOwner(input.ticketCode);
      await db.deletePartyPhoto(actor.profile.id, input.position);
      return { ok: true };
    }),
    makeMainPhoto: publicProcedure.input(z.object({ ticketCode: z.string(), position: z.number().int().min(1).max(MAX_PARTY_PHOTOS - 1) })).mutation(async ({ input }) => {
      const actor = await requirePartyPhotoOwner(input.ticketCode);
      await db.makeMainPartyPhoto(actor.profile.id, input.position);
      return { ok: true };
    }),
    setSwipeEnabled: publicProcedure.input(z.object({ ticketCode: z.string(), enabled: z.boolean() })).mutation(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      const res = await db.setPartySwipeEnabled(actor.profile.id, input.enabled);
      if (!res.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Primero sube tu foto' });
      // Entra al juego: a quienes tienen mucha afinidad con esta persona les llega un aviso (sin decir quién es).
      if (input.enabled && !actor.profile.swipeEnabled) void playmatch.notifyAffinityArrival(actor.profile.id);
      return { ok: true };
    }),

    // --- Swipe ---
    swipeDeck: publicProcedure.input(z.object({ ticketCode: z.string() })).query(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      // `null` = todavía no participa (sin foto o en pausa), no un error.
      const deck = await db.getPartySwipeDeck(actor.profile);
      return {
        deck,
        likesYou: deck ? (await playmatch.listLikesForMe(actor.profile)).count : 0,
        rewindsLeft: Math.max(0, MAX_REWINDS_PER_EVENT - (actor.profile.rewindsUsed ?? 0)),
      };
    }),
    // Deshacer el último ✕ (una vez por noche).
    undoSwipe: publicProcedure.input(z.object({ ticketCode: z.string() })).mutation(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      const res = await db.undoLastPartyNope(actor.profile);
      if (!res.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: res.reason });
      return { card: res.card };
    }),
    // «Mejor disfraz» (aniversario Halloween): a quién voté y cuántos votos me quedan.
    myCostumeVotes: publicProcedure.input(z.object({ ticketCode: z.string() })).query(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      return db.getMyCostumeVotes(actor.profile.id);
    }),
    // Votar (o quitar el voto). Los votos los ve solo el staff.
    voteCostume: publicProcedure.input(z.object({ ticketCode: z.string(), targetProfileId: z.number() })).mutation(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      const cfg = await db.getPartyConfig(actor.event.id);
      if (!cfg.costumes) throw new TRPCError({ code: 'BAD_REQUEST', message: 'El concurso de disfraces está en pausa por ahora' });
      if (cfg.costumeRevealed) throw new TRPCError({ code: 'BAD_REQUEST', message: 'La votación ya cerró: mira el podio' });
      const res = await db.toggleCostumeVote(actor.profile, input.targetProfileId);
      if (!res.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: res.reason });
      return res;
    }),
    // Ranking de disfraces para premiar en vivo (admin).
    costumeRanking: adminReadProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => db.getCostumeRanking(input.eventId)),

    // --- Control de Playmatch para el administrador (Admin → Noche → Playmatch) ---
    // Lo que se puede prender, apagar y cambiar en vivo de esta fiesta.
    adminConfig: adminReadProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => db.getPartyConfig(input.eventId)),
    adminSetConfig: adminProcedure.input(z.object({
      eventId: z.number(),
      enabled: z.boolean().optional(), superLikes: z.boolean().optional(), likesUnlock: z.boolean().optional(),
      costumes: z.boolean().optional(), costumeRevealed: z.boolean().optional(),
      superLikePrice: z.number().int().min(0).max(50_000).optional(), superLikePackSize: z.number().int().min(2).max(50).optional(),
      superLikePackPrice: z.number().int().min(0).max(500_000).optional(), maxPaidSuperLikes: z.number().int().min(0).max(100).optional(),
      likesUnlockPrice: z.number().int().min(0).max(50_000).optional(),
      hostGoal: z.object({ profiles: z.number().int().min(1).max(5000), photos: z.number().int().min(1).max(5000), matches: z.number().int().min(1).max(5000) }).partial().optional(),
    })).mutation(async ({ input }) => {
      const { eventId, ...patch } = input;
      return db.setPartyConfig(eventId, patch);
    }),
    // El conteo en vivo de todo lo que pasa en Playmatch.
    adminStats: adminReadProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => playmatch.adminStats(input.eventId)),
    // Cada cobro, regalo, devolución y ajuste (más nuevo primero).
    adminCharges: adminReadProcedure.input(z.object({ eventId: z.number(), limit: z.number().int().min(1).max(2000).optional(), offset: z.number().int().min(0).optional(), profileId: z.number().optional() }))
      .query(async ({ input }) => playmatch.adminCharges(input.eventId, input)),
    adminPeople: adminReadProcedure.input(z.object({ eventId: z.number(), q: z.string().max(60).default('') })).query(async ({ input }) => playmatch.adminPeople(input.eventId, input.q)),
    adminPendingSuperLikes: adminReadProcedure.input(z.object({ eventId: z.number(), profileId: z.number() })).query(async ({ input }) => playmatch.adminPendingSuperLikes(input.eventId, input.profileId)),
    adminGift: adminProcedure.input(z.object({ eventId: z.number(), profileId: z.number(), quantity: z.number().int().min(1).max(50), note: z.string().max(200).optional() }))
      .mutation(async ({ input, ctx }) => {
        try { return await playmatch.adminGiftSuperLikes({ ...input, actor: ctx.user.name || 'Admin' }); }
        catch (e) { throw new TRPCError({ code: 'BAD_REQUEST', message: e instanceof Error ? e.message : 'No se pudo regalar' }); }
      }),
    adminReturn: adminProcedure.input(z.object({ eventId: z.number(), connectionId: z.number(), note: z.string().max(200).optional() }))
      .mutation(async ({ input, ctx }) => {
        try { return await playmatch.adminReturnSuperLike({ ...input, actor: ctx.user.name || 'Admin' }); }
        catch (e) { throw new TRPCError({ code: 'BAD_REQUEST', message: e instanceof Error ? e.message : 'No se pudo devolver' }); }
      }),
    adminSetCap: adminProcedure.input(z.object({ eventId: z.number(), profileId: z.number(), cap: z.number().int().min(0).max(100).nullable() }))
      .mutation(async ({ input, ctx }) => {
        try { return await playmatch.adminSetCap({ ...input, actor: ctx.user.name || 'Admin' }); }
        catch (e) { throw new TRPCError({ code: 'BAD_REQUEST', message: e instanceof Error ? e.message : 'No se pudo cambiar' }); }
      }),
    // Pestaña Matches: con quién, último mensaje, no leídos y «Visto».
    myMatches: publicProcedure.input(z.object({ ticketCode: z.string() })).query(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      return db.listPartyMatches(actor.profile.id);
    }),
    swipe: publicProcedure.input(z.object({ ticketCode: z.string(), targetProfileId: z.number(), liked: z.boolean() }))
      .mutation(async ({ input }) => {
        const actor = await requirePartyProfile(input.ticketCode);
        const res = await db.swipePartyProfile(actor.profile, input.targetProfileId, input.liked);
        if (!res.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: res.reason });
        if (!res.match) return { match: false as const };

        const otherTicketCode = await db.getPartyProfileTicketCode(res.otherId);
        if (otherTicketCode) {
          await sendPushToProfile(res.otherId, {
            title: '💘 ¡Hicieron match!',
            body: `Tú y ${actor.profile.alias} se gustaron en Playmatch`,
            url: `/fiesta/${otherTicketCode}`,
          });
        }
        return { match: true as const, connectionId: res.connectionId, alias: res.otherAlias };
      }),

    block: publicProcedure.input(z.object({ ticketCode: z.string(), targetProfileId: z.number() }))
      .mutation(async ({ input }) => {
        const actor = await requirePartyProfile(input.ticketCode);
        await db.blockPartyProfile(actor.profile.id, input.targetProfileId, actor.event.id);
        return { ok: true };
      }),

    report: publicProcedure.input(z.object({ ticketCode: z.string(), targetProfileId: z.number(), reason: z.string().min(3).max(500) }))
      .mutation(async ({ input }) => {
        const actor = await requirePartyProfile(input.ticketCode);
        // Denunciar también bloquea: quien denuncia no debería seguir
        // viendo a esa persona mientras el equipo revisa.
        await db.reportPartyProfile(actor.profile.id, input.targetProfileId, actor.event.id, input.reason.trim());
        await db.blockPartyProfile(actor.profile.id, input.targetProfileId, actor.event.id);
        await sendPushToAdmins('pushPartyReport', {
          title: pushTitle('⚠️', 'Denuncia en la fiesta'),
          body: input.reason.trim().slice(0, 120),
          url: '/admin?section=denuncias',
        });
        return { ok: true };
      }),

    // --- Notificaciones push del invitado (mensaje nuevo, promos relámpago) ---
    // La clave pública VAPID acá SÍ es pública sin gate: a diferencia del
    // admin, el invitado no tiene sesión detrás de la cual esconderla.
    getVapidPublicKey: publicProcedure.query(() => {
      return { publicKey: process.env.VAPID_PUBLIC_KEY ?? null };
    }),
    pushSubscribe: publicProcedure.input(z.object({
      ticketCode: z.string(),
      endpoint: z.string().url().max(512),
      p256dh: z.string(),
      auth: z.string(),
    })).mutation(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      return db.savePartyPushSubscription({
        profileId: actor.profile.id,
        eventId: actor.event.id,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
      });
    }),
    pushUnsubscribe: publicProcedure.input(z.object({ endpoint: z.string() })).mutation(async ({ input }) => {
      return db.deletePartyPushSubscription(input.endpoint);
    }),

    // --- Invitar un trago ---
    // Tres pasos porque el destinatario puede rechazar y nadie paga por un
    // trago rechazado: invitar (gratis) -> responder -> pagar.
    listDrinks: publicProcedure.input(z.object({ ticketCode: z.string() })).query(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      return db.listPartyDrinks(actor.event.id);
    }),

    sendGift: publicProcedure.input(z.object({
      ticketCode: z.string(),
      targetProfileId: z.number(),
      ticketTypeId: z.number(),
      message: z.string().optional(),
    })).mutation(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);

      const check = sanitizeGiftMessage(input.message ?? '');
      if (!check.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: check.reason });

      const res = await db.createGiftInvitation({
        eventId: actor.event.id,
        fromProfileId: actor.profile.id,
        toProfileId: input.targetProfileId,
        ticketTypeId: input.ticketTypeId,
        message: check.body,
      });
      if (!res.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: res.reason });
      return res;
    }),

    respondGift: publicProcedure.input(z.object({ ticketCode: z.string(), giftId: z.number(), accept: z.boolean() }))
      .mutation(async ({ input }) => {
        const actor = await requirePartyProfile(input.ticketCode);
        const res = await db.respondToGiftInvitation(actor.profile.id, input.giftId, input.accept);
        if (!res.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: res.reason });
        return res;
      }),

    // Crea la orden del regalo y devuelve su número. El cobro después va
    // por `orders.processCardPayment`, el mismo endpoint que las entradas.
    payGift: publicProcedure.input(z.object({ ticketCode: z.string(), giftId: z.number() }))
      .mutation(async ({ input }) => {
        const actor = await requirePartyProfile(input.ticketCode);
        // El comprador es el dueño del acceso con el que entró: su email ya
        // está en la orden de su entrada, no se le vuelve a pedir nada.
        const contact = await db.getPartyProfileContact(actor.profile.id);
        if (!contact?.email) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No pudimos identificar tu correo' });

        const res = await db.createGiftOrder(actor.profile.id, input.giftId, { name: contact.alias, email: contact.email });
        if (!res.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: res.reason });
        return res;
      }),

    myGifts: publicProcedure.input(z.object({ ticketCode: z.string() })).query(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      return db.listMyGifts(actor.profile.id);
    }),

    // Para el equipo del local, durante la fiesta.
    listGifts: adminReadProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return db.listPartyGiftsForEvent(input.eventId);
    }),
    // Denuncias de todos los eventos, para la sección "Denuncias" del admin:
    // hasta ahora se guardaban en la base sin ninguna pantalla donde verlas.
    // --- Herramienta "Probar Playmatch": invitados de prueba en un evento OCULTO ---
    testStatus: adminReadProcedure.query(async () => db.listPlaymatchTest()),
    testCreate: adminProcedure.input(z.object({
      count: z.number().int().min(MIN_TEST_GUESTS).max(MAX_TEST_GUESTS),
      inside: z.boolean(),
    })).mutation(async ({ input }) => db.createPlaymatchTestGuests(input)),
    testEnter: adminProcedure.input(z.object({ ticketCode: z.string() })).mutation(async ({ input }) => {
      const res = await db.markPlaymatchTestGuestEntered(input.ticketCode);
      if (!res.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: res.reason });
      return res;
    }),
    testDelete: adminProcedure.mutation(async () => db.deletePlaymatchTestData()),
    listAllReports: adminReadProcedure.query(async () => {
      return db.listAllPartyReports();
    }),
    // Expulsar (o reincorporar) a la persona denunciada, solo por esa noche.
    setProfileBanned: adminProcedure.input(z.object({
      profileId: z.number(),
      banned: z.boolean(),
    })).mutation(async ({ input }) => {
      return db.setPartyProfileBanned(input.profileId, input.banned);
    }),
    setReportResolved: adminProcedure.input(z.object({
      id: z.number(),
      resolved: z.boolean(),
    })).mutation(async ({ input }) => {
      return db.setPartyReportResolved(input.id, input.resolved);
    }),
  }),

  discounts: router({
    listAll: adminReadProcedure.query(async () => {
      return db.getAllDiscountCodes();
    }),
    create: adminProcedure.input(z.object({
      code: z.string(),
      description: z.string().optional(),
      discountType: z.enum(['percentage', 'fixed']),
      discountValue: z.number(),
      minPurchase: z.number().optional(),
      maxUses: z.number().optional(),
      eventId: z.number().optional(),
      // Producto de regalo (ej. un FIREROOM): se agrega solo, a $0, a la orden
      // que use el código (ver processApprovedOrder en server/webhooks.ts).
      giftTicketTypeId: z.number().optional(),
      validFrom: z.string().optional(),
      validUntil: z.string().optional(),
    })).mutation(async ({ input }) => {
      if (input.giftTicketTypeId) {
        if (!input.eventId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Para regalar un producto elige el evento del código.' });
        const gift = await db.getTicketTypeById(input.giftTicketTypeId);
        if (!gift || gift.eventId !== input.eventId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ese producto no pertenece al evento elegido.' });
        // Un código de regalo no descuenta plata: lo que da es el producto.
        return db.createDiscountCode({ ...input, discountType: 'fixed', discountValue: 0 });
      }
      return db.createDiscountCode(input);
    }),
    // Editar un código existente. El texto del código NO se cambia (ya está
    // repartido en links y mensajes); sí tipo, valor, evento, regalo, usos,
    // vencimiento y si está activo. `usedCount` nunca se toca.
    update: adminProcedure.input(z.object({
      id: z.number(),
      description: z.string().nullable().optional(),
      discountType: z.enum(['percentage', 'fixed']),
      discountValue: z.number().min(0),
      maxUses: z.number().int().positive().nullable(),
      eventId: z.number().nullable(),
      giftTicketTypeId: z.number().nullable(),
      validUntil: z.string().nullable(),
      isActive: z.boolean(),
    })).mutation(async ({ input, ctx }) => {
      if (input.giftTicketTypeId) {
        if (!input.eventId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Para regalar un producto elige el evento del código.' });
        const gift = await db.getTicketTypeById(input.giftTicketTypeId);
        if (!gift || gift.eventId !== input.eventId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ese producto no pertenece al evento elegido.' });
      } else if (input.discountValue <= 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ingresa el valor del descuento.' });
      }
      if (input.discountType === 'percentage' && input.discountValue > 100) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Un porcentaje no puede pasar de 100.' });
      }
      const ok = await db.updateDiscountCode(input.id, {
        description: input.description ?? null,
        // Un código de regalo no descuenta plata: lo que da es el producto.
        discountType: input.giftTicketTypeId ? 'fixed' : input.discountType,
        discountValue: input.giftTicketTypeId ? 0 : input.discountValue,
        maxUses: input.maxUses,
        eventId: input.eventId,
        giftTicketTypeId: input.giftTicketTypeId,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        isActive: input.isActive ? 1 : 0,
      });
      if (!ok) throw new TRPCError({ code: 'NOT_FOUND', message: 'No encontramos ese código.' });
      await db.recordAdminAudit({ action: 'discounts.update', targetType: 'discountCode', targetId: input.id, ip: clientIp(ctx) });
      return { success: true };
    }),
    delete: adminPasswordProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const result = await db.deleteDiscountCode(input.id);
      await db.recordAdminAudit({ action: 'discounts.delete', targetType: 'discountCode', targetId: input.id, ip: clientIp(ctx) });
      return result;
    }),
  }),

  // Promo relámpago: un código con vencimiento (mismo `discountCodes` de
  // siempre -- ya lo valida el checkout web Y la venta de Caja, así que no
  // hace falta ningún flujo de compra nuevo) + un push en vivo a todos los
  // invitados suscritos de la fiesta activa.
  flashPromo: router({
    send: adminProcedure.input(z.object({
      message: z.string().min(3).max(200),
      discountPercent: z.number().int().min(1).max(100),
      minutes: z.number().int().min(1).max(180),
      ticketTypeIds: z.array(z.number()).min(1),
    })).mutation(async ({ input }) => {
      const event = await db.getActiveEventForCaja();
      if (!event) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No hay una fiesta activa ahora mismo' });

      const code = `FLASH${nanoid(4).toUpperCase()}`;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + input.minutes * 60_000);
      await db.createDiscountCode({
        code,
        description: input.message,
        discountType: 'percentage',
        discountValue: input.discountPercent,
        eventId: event.id,
        validFrom: now,
        validUntil: expiresAt,
        isActive: 1,
        applicableTicketTypeIds: input.ticketTypeIds,
      });

      const { sent } = await sendPushToEventGuests(event.id, {
        title: '🎉 Promo relámpago',
        body: `${input.message} -- código ${code}, vale por ${input.minutes} min`,
        url: `/eventos/${event.slug}`,
      });

      return { code, expiresAt, sent };
    }),
    // Pública: Caja la pollea (sin login de cajero necesario para leerla)
    // para pintar la insignia "Promo Flash" y aplicar el descuento solo.
    active: publicProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return db.getActiveFlashPromo(input.eventId);
    }),
    // Plantillas pregrabadas -- un toque en el admin solo RELLENA el
    // formulario de `send`, nunca lo manda solo.
    listPresets: adminReadProcedure.query(async () => {
      const settings = await db.getSiteSettings();
      return normalizeFlashPromoPresets((settings as any).flashPromoPresets);
    }),
    savePreset: adminProcedure.input(z.object({
      id: z.string().optional(),
      label: z.string().min(1).max(60),
      message: z.string().min(3).max(200),
      discountPercent: z.number().int().min(1).max(100),
      minutes: z.number().int().min(1).max(180),
      ticketTypeIds: z.array(z.number()).min(1),
    })).mutation(async ({ input }) => {
      const settings = await db.getSiteSettings();
      const presets = normalizeFlashPromoPresets((settings as any).flashPromoPresets);
      const id = input.id ?? nanoid(8);
      const preset = { ...input, id };
      const next = presets.some((p) => p.id === id)
        ? presets.map((p) => p.id === id ? preset : p)
        : [...presets, preset];
      await db.updateSiteSettings({ flashPromoPresets: next });
      return preset;
    }),
    deletePreset: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
      const settings = await db.getSiteSettings();
      const presets = normalizeFlashPromoPresets((settings as any).flashPromoPresets);
      await db.updateSiteSettings({ flashPromoPresets: presets.filter((p) => p.id !== input.id) });
      return { success: true };
    }),
  }),

  settings: router({
    get: publicProcedure.query(async () => {
      return db.getSiteSettings();
    }),
    /* Trae de Instagram los seguidores y publicaciones del footer (gratis, sin IA). */
    syncInstagram: adminProcedure.mutation(async () => {
      try {
        return await syncInstagramStats();
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo actualizar desde Instagram.' });
      }
    }),
    update: adminProcedure.input(z.object({
      instagramFollowers: z.number().optional(),
      instagramPosts: z.number().optional(),
      serviceFeePercent: z.number().min(0).max(100).optional(),
      cardFeePercent: z.number().min(0).max(100).optional(),
      parkingVenueFeeClp: z.number().min(0).optional(),
      kitchenVendorName: z.string().nullable().optional(),
      kitchenVendorEmail: z.string().email().nullable().optional(),
      ogImageUrl: z.string().url().nullable().optional(),
      foundersPromoEnabled: z.boolean().optional(),
      tanda2PromoEnabled: z.boolean().optional(),
      salesDripEnabled: z.boolean().optional(),
      salesDripIntervalDays: z.number().int().min(1).max(30).optional(),
      halloweenModeEnabled: z.boolean().optional(),
    })).mutation(async ({ input }) => {
      // Los avisos de 1ª y 2ª tanda son excluyentes: juntos sumarían 100
      // correos/día contra el límite de Resend (ver server/tanda2Promo.ts).
      if (input.tanda2PromoEnabled) input.foundersPromoEnabled = false;
      else if (input.foundersPromoEnabled) input.tanda2PromoEnabled = false;
      // El aviso continuo reemplaza a los dos por tanda: prenderlo los apaga
      // (comparten el tope de 50/día y mandarían doble).
      if (input.salesDripEnabled) {
        input.foundersPromoEnabled = false;
        input.tanda2PromoEnabled = false;
      } else if (input.foundersPromoEnabled || input.tanda2PromoEnabled) {
        input.salesDripEnabled = false;
      }
      return db.updateSiteSettings(input);
    }),
    // Mismo número que llega en el correo de las 3am (server/cronRoutes.ts),
    // pero en vivo para revisarlo manual desde Ajustes.
    checkinCount: adminReadProcedure.query(async () => {
      const event = await db.getActiveEventForCaja();
      if (!event) return null;
      const dashboard = await db.getCajaDashboard(event.id);
      if (!dashboard) return null;
      return { eventTitle: event.title, insideCount: dashboard.insideCount, expectedCount: dashboard.expectedCount };
    }),
  }),

  // Resumen de Inicio del admin (server/homeSummary.ts): un endpoint por
  // bloque. Plata es solo del administrador (igual que Finanzas); los otros
  // dos son conteos y los abre también el invitado de demostración.
  home: router({
    evento: adminReadProcedure.input(z.object({ eventId: z.number().int().positive() })).query(({ input }) => homeSummary.getHomeEvento(input.eventId)),
    plata: adminProcedure.query(() => homeSummary.getHomePlata()),
    gente: adminReadProcedure.input(z.object({ eventId: z.number().int().positive().nullish() }).optional()).query(({ input }) => homeSummary.getHomeGente(input?.eventId ?? null)),
  }),

  // Burbujas con números sobre cada ítem del menú del admin: el dueño tenía
  // que entrar sección por sección para descubrir si había algo nuevo. El
  // cliente manda cuándo miró cada sección por última vez (lo guarda en
  // localStorage) y acá se cuenta lo que llegó después -- salvo las secciones
  // de "pendiente de acción", que se cuentan siempre (ver getAdminBadgeCounts).
  adminBadges: router({
    counts: adminReadProcedure.input(z.object({
      seenAt: z.record(z.string(), z.string().datetime()).default({}),
    })).query(async ({ input }) => {
      const parsed: Partial<Record<db.AdminBadgeSection, Date>> = {};
      for (const [section, iso] of Object.entries(input.seenAt)) {
        const date = new Date(iso);
        if (!Number.isNaN(date.getTime())) parsed[section as db.AdminBadgeSection] = date;
      }
      return db.getAdminBadgeCounts(parsed);
    }),
  }),

  // Push al /admin instalado + correo resumen diario (server/push.ts,
  // server/adminDigest.ts) -- interruptores en shared/adminAlertsConfig.ts,
  // todos apagados por defecto.
  adminAlerts: router({
    getConfig: adminReadProcedure.query(async () => {
      const settings = await db.getSiteSettings();
      return normalizeAdminAlertsConfig((settings as any).adminAlertsConfig);
    }),
    saveConfig: adminProcedure.input(z.object({
      pushNewOrder: z.boolean(),
      pushAmbassadorApplication: z.boolean(),
      pushPartyReport: z.boolean(),
      pushInstagramHandoff: z.boolean(),
      // Opcional para no romper un panel abierto con la versión anterior.
      pushWhatsAppHandoff: z.boolean().optional(),
      dailyDigestEmail: z.boolean(),
      pushCajaAlerts: z.boolean().optional(),
      cajaAiSummary: z.boolean().optional(),
      financeMarginTargetPercent: z.number().min(1).max(90).optional(),
      financeNightlyEmail: z.boolean().optional(),
      financeWeeklyEmail: z.boolean().optional(),
      cajaLowStockUnits: z.number().int().min(0).max(10000).optional(),
      cajaHighSaleClp: z.number().int().min(0).optional(),
    })).mutation(async ({ input }) => {
      // Los datos del gasto de IA se editan en el Estudio: no se pierden al guardar Ajustes.
      const current = normalizeAdminAlertsConfig(((await db.getSiteSettings()) as any)?.adminAlertsConfig);
      const { aiCapUsd, aiBalanceUsd, aiBalanceAt, aiAlertSent, aiSpentOffsetUsd, aiSpentOffsetMonth } = current;
      return db.updateSiteSettings({ adminAlertsConfig: normalizeAdminAlertsConfig({ ...input, aiCapUsd, aiBalanceUsd, aiBalanceAt, aiAlertSent, aiSpentOffsetUsd, aiSpentOffsetMonth }) });
    }),
    // La clave pública VAPID no es secreta (viaja al navegador para armar la
    // suscripción), pero igual queda detrás de admin para no publicarla sin
    // razón -- si no está configurada, el cliente sabe que debe mostrar
    // "todavía no disponible" en vez de intentar suscribirse.
    getVapidPublicKey: adminReadProcedure.query(async () => {
      return { publicKey: process.env.VAPID_PUBLIC_KEY ?? null };
    }),
    subscribe: adminProcedure.input(z.object({
      endpoint: z.string().url().max(512),
      p256dh: z.string(),
      auth: z.string(),
      label: z.string().max(100).optional(),
    })).mutation(async ({ input }) => {
      return db.savePushSubscription(input);
    }),
    unsubscribe: adminProcedure.input(z.object({ endpoint: z.string() })).mutation(async ({ input }) => {
      return db.deletePushSubscription(input.endpoint);
    }),
    listSubscriptions: adminReadProcedure.query(async () => {
      return db.listPushSubscriptions();
    }),
    removeSubscription: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      return db.deletePushSubscriptionById(input.id);
    }),
    // Manda un push de prueba a TODOS los dispositivos suscritos ahora mismo,
    // sin importar los interruptores -- para confirmar que la suscripción de
    // este dispositivo realmente funciona antes de confiar en las alertas.
    sendTestPush: adminProcedure.mutation(async () => {
      await sendTestPushToAllAdmins();
      return { success: true };
    }),
    // Manda el correo resumen ya mismo (respeta el interruptor), mismo
    // criterio que foundersPromoRunNow -- para probarlo sin esperar al cron.
    sendDigestNow: adminProcedure.mutation(async () => {
      return runAdminDigest();
    }),
  }),

  /* Bandeja del agente de IA que contesta el Instagram (server/instagram.ts).
   *
   * Todo detrás de `adminProcedure` y no de `adminReadProcedure`, incluidas
   * las lecturas: acá viajan conversaciones privadas de personas que le
   * escribieron a la cuenta, y el invitado de demostración del panel no
   * tiene por qué leerlas ni siquiera enmascaradas. */
  // Encuesta post-fiesta, lado PÚBLICO (server/eventSurvey.ts): la persona
  // llega con el token secreto de su correo. El token es de 192 bits, así que
  // no se adivina; igual se limita por IP el envío, como los demás
  // formularios públicos. Nunca devuelve el correo de nadie.
  survey: router({
    get: publicProcedure.input(z.object({ token: z.string().min(8).max(64) })).query(async ({ input }) => {
      const row = await db.getSurveyByToken(input.token);
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Este link de la encuesta no es válido.' });
      return {
        eventTitle: row.eventTitle,
        eventDate: row.eventDate,
        firstName: (row.buyerName ?? '').trim().split(' ')[0] || null,
        answered: row.respondedAt != null,
      };
    }),
    submit: publicProcedure.input(z.object({
      token: z.string().min(8).max(64),
      rating: z.number().int().min(1).max(5),
      liked: z.string().max(2000).optional(),
      improve: z.string().max(2000).optional(),
    })).mutation(async ({ input, ctx }) => {
      const ipKey = `survey-submit:${clientIp(ctx)}`;
      if (!(await db.checkIpRateLimit(ipKey))) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Prueba de nuevo en un rato.' });
      }
      await db.recordIpAttempt(ipKey, 20, 60 * 60 * 1000);
      const row = await db.getSurveyByToken(input.token);
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Este link de la encuesta no es válido.' });
      const answer = parseSurveyAnswer(input);
      if (!answer) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Elige una nota de 1 a 5.' });
      const saved = await db.saveSurveyResponse(input.token, answer);
      return { saved, alreadyAnswered: !saved };
    }),
  }),

  // Encuesta post-fiesta, lado ADMIN. adminProcedure en todo (no
  // adminReadProcedure): mandar correos y llamar a la IA cuestan, y leer las
  // respuestas es feedback de clientes -- mismo nivel en todas evita medias
  // puertas.
  eventSurvey: router({
    panel: adminProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return getEventSurveyPanel(input.eventId);
    }),
    sendNow: adminProcedure.input(z.object({ eventId: z.number() })).mutation(async ({ input }) => {
      try {
        return await sendEventSurveys(input.eventId);
      } catch (err) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err instanceof Error ? err.message : 'No se pudieron mandar las encuestas.' });
      }
    }),
    sendTest: adminProcedure.input(z.object({ eventId: z.number() })).mutation(async ({ input }) => {
      try {
        return await sendSurveyTestEmail(input.eventId);
      } catch (err) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err instanceof Error ? err.message : 'No se pudo mandar la prueba.' });
      }
    }),
    setAuto: adminProcedure.input(z.object({ eventId: z.number(), enabled: z.boolean() })).mutation(async ({ input }) => {
      await db.setEventSurveyAutoSend(input.eventId, input.enabled);
      return { success: true };
    }),
    analyze: adminProcedure.input(z.object({ eventId: z.number() })).mutation(async ({ input }) => {
      try {
        return await analyzeEventSurvey(input.eventId);
      } catch (err) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err instanceof Error ? err.message : 'No se pudo generar el análisis.' });
      }
    }),
  }),

  // Plan de contenido para Instagram (server/contentPlanner.ts): calendario de
  // publicaciones hasta el próximo evento. adminProcedure: llama a la IA con
  // costo. No guarda nada en el servidor; el panel recuerda el último plan.
  /* "Ventana a Instagram" de la portada: perfil y últimas publicaciones públicas
   * (lo mismo que ve cualquiera en el perfil), con caché de 1 hora. */
  instagramShowcase: router({
    get: publicProcedure.query(() => getInstagramShowcase()),
  }),

  /* "Revisar mi perfil" de Instagram: puntaje de 100 con la rúbrica de Playroom. */
  profileAudit: router({
    /* Estadísticas reales de las últimas publicaciones (gratis, sin IA). */
    insights: adminProcedure.input(z.object({ force: z.boolean().optional() }).optional()).query(async ({ input }) => {
      return getInstagramInsights({ force: input?.force });
    }),
    fetchProfile: adminProcedure.mutation(async () => {
      try {
        return await fetchOwnProfile();
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo traer el perfil.' });
      }
    }),
    run: adminProcedure.input(z.object({
      username: z.string().max(60),
      name: z.string().max(100),
      bio: z.string().max(400),
      link: z.string().max(300),
      followers: z.number().int().nonnegative().optional(),
      posts: z.number().int().nonnegative().optional(),
      highlights: z.array(z.string().max(40)).max(20),
      screenshotUrl: z.string().url().optional(),
    })).mutation(async ({ input }) => {
      try {
        return await generateProfileAudit(input);
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo revisar el perfil.' });
      }
    }),
  }),

  contentPlan: router({
    /* Guion de Reel (3 ganchos + líneas + qué grabar) desde una idea o una pieza del plan. */
    reelScript: adminProcedure.input(z.object({
      idea: z.string().min(3).max(1200),
      targetEventId: z.number().optional(),
    })).mutation(async ({ input }) => {
      try {
        return await generateReelScript(input);
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo escribir el guion.' });
      }
    }),
    generate: adminProcedure.input(z.object({
      targetEventId: z.number().optional(),
      // Lo que el dueño quiere en ESTE plan ("2 desafíos tipo quiz", "algo para
      // los que ya vinieron"). Texto libre y corto.
      focus: z.string().max(500).optional(),
    }).optional()).mutation(async ({ input }) => {
      try {
        return await generateContentPlan(input?.targetEventId, new Date(), input?.focus);
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo generar el plan.' });
      }
    }),
  }),

  // Gasto de IA por función y por día (tabla aiUsage; shared/aiUsage.ts).
  aiUsage: router({
    budget: adminReadProcedure.query(async () => loadAiBudget()),
    setBudget: adminProcedure.input(z.object({
      capUsd: z.number().min(0).max(100000),
      balanceUsd: z.number().min(0).max(100000),
      spentMonthUsd: z.number().min(0).max(100000).optional(),
    })).mutation(async ({ input }) => {
      await saveAiBudget(input);
      return loadAiBudget();
    }),
    summary: adminReadProcedure.input(z.object({ days: z.number().int().min(1).max(90).default(30) })).query(async ({ input }) => {
      const rows = await listAiUsageSince(new Date(Date.now() - input.days * 86_400_000));
      return summarizeAiUsage(rows);
    }),
  }),

  // Estudio de contenido (server/contentStudio.ts): carruseles, posts e
  // historias con las plantillas de marca. Leer es adminReadProcedure (no hay
  // datos personales); guardar, adminProcedure; borrar pide la clave, como
  // todo lo que se borra en el panel.
  // Contenido para los embajadores (shared/ambassadorContent.ts): se generan
  // borradores solos por evento, el dueño los revisa y aprueba, y cada
  // embajador ve lo aprobado en su panel con su link y su código.
  ambassadorContent: router({
    list: adminReadProcedure.query(async () => {
      const [items, events] = await Promise.all([listAmbassadorItems(), getUpcomingContentEvents()]);
      return { items, events };
    }),
    // Lo llama el admin al abrir la pantalla (y el cron diario): crea los
    // borradores que falten. Idempotente.
    generateDrafts: adminProcedure.mutation(async () => ({ created: await ensureAmbassadorDrafts() })),
    save: adminProcedure.input(z.object({
      id: z.number().int().positive().optional(),
      // La forma fina la valida y recorta normalizeAmbassadorItem.
      item: z.record(z.string(), z.unknown()),
    })).mutation(async ({ input }) => ({ id: await saveAmbassadorItem(input.id, input.item) })),
    setStatus: adminProcedure.input(z.object({
      ids: z.array(z.number().int().positive()).min(1).max(100),
      status: z.enum(['borrador', 'aprobado', 'descartado']),
    })).mutation(async ({ input }) => {
      const changed = await setAmbassadorItemStatus(input.ids, input.status);
      // Contenido nuevo aprobado: aviso a las embajadoras (sin frenar la respuesta).
      if (input.status === 'aprobado' && changed > 0) void notifyAmbassadorsNewContent(changed).catch((e) => console.error('[embajadores] Aviso de contenido nuevo:', e));
      return { changed };
    }),
    // Diseños del Estudio (plantillas y videos grabados) a «Por aprobar», de a uno o varios.
    sendDesigns: adminProcedure.input(z.object({
      ids: z.array(z.number().int().positive()).min(1).max(60),
    })).mutation(async ({ input }) => sendStudioToAmbassadors(input.ids)),
    delete: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      await deleteAmbassadorItem(input.id);
      return { success: true };
    }),
  }),

  contentStudio: router({
    list: adminReadProcedure.query(async () => listContentDesigns()),
    get: adminReadProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
      const design = await getContentDesign(input.id);
      if (!design) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ese diseño ya no existe.' });
      return design;
    }),
    save: adminProcedure.input(z.object({
      id: z.number().int().positive().optional(),
      // La forma fina la valida y recorta normalizeStudioDesign (shared/contentStudio.ts).
      design: z.object({
        title: z.string().max(300),
        format: z.string().max(20),
        theme: z.string().max(30),
        eventId: z.number().int().nullable().optional(),
        caption: z.string().max(5000),
        slides: z.array(z.unknown()).min(1).max(40),
      }),
    })).mutation(async ({ input }) => {
      try {
        const id = await saveContentDesign(input.id, input.design);
        // Pack del evento automático: con un evento elegido, queda en «Por aprobar» para los embajadores.
        if (input.design.eventId != null) void autoPackFromDesign(id).catch((e) => console.error('[estudio] Pack para embajadores:', e));
        return { id };
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo guardar el diseño.' });
      }
    }),
    // Videos del Estudio (shared/studioVideo.ts): se guardan igual que los diseños.
    getVideo: adminReadProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
      const video = await getContentVideo(input.id);
      if (!video) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ese video ya no existe.' });
      return video;
    }),
    saveVideo: adminProcedure.input(z.object({
      id: z.number().int().positive().optional(),
      // La forma fina la valida y recorta normalizeStudioVideo.
      video: z.object({
        title: z.string().max(300),
        template: z.string().max(20),
        format: z.string().max(20),
        theme: z.string().max(30),
        eventId: z.number().int().nullable().optional(),
        caption: z.string().max(5000),
        scenes: z.array(z.unknown()).max(40),
        design: z.unknown().optional(),
        mediaUrl: z.string().max(2000).optional(),
        cta: z.string().max(200).optional(),
        ctaLine: z.string().max(300).optional(),
        secsPerSlide: z.number().optional(),
        style: z.unknown().optional(),
        watermark: z.unknown().optional(),
        music: z.unknown().optional(),
      }),
    })).mutation(async ({ input }) => {
      try {
        return { id: await saveContentVideo(input.id, input.video) };
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo guardar el video.' });
      }
    }),
    // «Desde una idea»: Claude solo escribe (escenas de un video, o los textos de una
    // foto); las plantillas y HyperFrames dibujan y graban (server/studioAi/quickIdea.ts).
    quickVideo: adminProcedure.input(z.object({
      brief: z.string().trim().min(1, 'Escribe qué quieres').max(2000),
      format: z.enum(['reel', 'feed']).default('reel'),
      eventId: z.number().int().positive().nullable().optional(),
      model: z.enum(AI_MODELS).default('claude-haiku-4-5'),
      sceneCount: z.number().int().min(2).max(8).default(4),
    })).mutation(async ({ input }) => {
      try {
        const result = await quickVideoFromIdea({ ...input, eventId: input.eventId ?? null });
        const id = await saveContentVideo(undefined, result.video);
        await recordAiUsage({ feature: 'studio-video', model: result.model, ...result.usage, costUsd: result.costUsd });
        return { id, costUsd: result.costUsd };
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo crear el video.' });
      }
    }),
    quickPhoto: adminProcedure.input(z.object({
      brief: z.string().trim().min(1, 'Escribe de qué trata').max(2000),
      imageUrl: z.string().max(1000).default(''),
      eventId: z.number().int().positive().nullable().optional(),
      model: z.enum(AI_MODELS).default('claude-haiku-4-5'),
    })).mutation(async ({ input }) => {
      try {
        const result = await quickPhotoTexts({ ...input, eventId: input.eventId ?? null });
        await recordAiUsage({ feature: 'studio-foto', model: result.model, ...result.usage, costUsd: result.costUsd });
        return { texts: result.texts, costUsd: result.costUsd };
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudieron escribir los textos.' });
      }
    }),
    // Grabar a MP4 con GitHub Actions (server/studioRender.ts). El panel manda el
    // proyecto ya armado; el estado se lee con getVideo (campo `render`).
    renderVideo: adminProcedure.input(z.object({
      id: z.number().int().positive(),
      project: z.object({
        html: z.string().max(3_000_000),
        assets: z.array(z.tuple([z.string().max(200), z.string().max(2000)])).max(80),
      }),
    })).mutation(async ({ input }) => {
      try {
        return await requestVideoRender(input.id, input.project);
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo empezar la grabación.' });
      }
    }),
    renderConfig: adminReadProcedure.query(() => ({ missing: renderMissingConfig() })),
    // Modo «Rápido»: la IA escribe los textos y la plantilla Bubble dibuja (server/studioAi/quick.ts).
    quick: adminProcedure.input(z.object({
      brief: z.string().trim().min(1, 'Escribe qué quieres').max(2000),
      format: z.enum(STUDIO_FORMATS).default('carrusel'),
      eventId: z.number().int().positive().nullable().optional(),
      model: z.enum(AI_MODELS).default('claude-haiku-4-5'),
      slideCount: z.number().int().min(1).max(10).default(6),
    })).mutation(async ({ input }) => {
      try {
        const result = await quickBubbleDesign({ ...input, eventId: input.eventId ?? null });
        const id = await saveContentDesign(undefined, result.design);
        await recordAiUsage({ feature: 'studio-rapido', model: result.model, ...result.usage, costUsd: result.costUsd });
        return { id, costUsd: result.costUsd };
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo crear el diseño.' });
      }
    }),
    delete: adminPasswordProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      await deleteContentDesign(input.id);
      return { success: true } as const;
    }),
    // «Mi estilo» de los videos (plantilla, diseño, logo y música con un nombre).
    videoStyles: adminReadProcedure.query(() => listVideoStyles()),
    saveVideoStyle: adminProcedure.input(z.object({ style: z.record(z.string(), z.unknown()) })).mutation(async ({ input }) => {
      try {
        return { id: await saveVideoStyle(input.style) };
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo guardar el estilo.' });
      }
    }),
    deleteVideoStyle: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      await deleteVideoStyle(input.id);
      return { success: true } as const;
    }),
  }),

  // Diseñador IA del Estudio (server/studioAi/): el chat que diseña va por SSE
  // (/api/admin/studio/ai); acá queda leer el diseño con su conversación,
  // volver a una versión y los cambios a mano (nombre, caption).
  studioAi: router({
    get: adminReadProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
      const design = await loadAiDesign(input.id);
      if (!design) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ese diseño ya no existe.' });
      return { id: input.id, design, messages: await listAiMessages(input.id) };
    }),
    restore: adminProcedure.input(z.object({ id: z.number().int().positive(), messageId: z.number().int().positive() })).mutation(async ({ input }) => {
      try {
        return await restoreAiVersion(input.id, input.messageId);
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo volver a esa versión.' });
      }
    }),
    saveSlide: adminProcedure.input(z.object({
      id: z.number().int().positive(),
      index: z.number().int().min(0).max(40),
      html: z.string().min(1).max(60_000),
    })).mutation(async ({ input }) => {
      try {
        return await saveSlideEdit(input.id, input.index, input.html);
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo guardar la lámina.' });
      }
    }),
    updateMeta: adminProcedure.input(z.object({
      id: z.number().int().positive(),
      title: z.string().trim().min(1).max(200).optional(),
      caption: z.string().max(3000).optional(),
    })).mutation(async ({ input }) => {
      try {
        return await updateAiDesignMeta(input.id, { title: input.title, caption: input.caption });
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo guardar.' });
      }
    }),
  }),

  // Reactivación de clientes (server/winback.ts): segmentos de quienes ya
  // compraron, un correo redactado por la IA para cada uno y la campaña en la
  // cola del mailing. adminProcedure en todo: redactar llama a la IA y crear
  // la campaña manda correos a clientes reales.
  winback: router({
    overview: adminProcedure.input(z.object({ targetEventId: z.number().optional() }).optional()).query(async ({ input }) => {
      try {
        return await getWinbackOverview(input?.targetEventId);
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudieron armar los grupos.' });
      }
    }),
    draft: adminProcedure.input(z.object({
      segmentKey: z.enum(WINBACK_SEGMENT_KEYS),
      targetEventId: z.number().optional(),
    })).mutation(async ({ input }) => {
      try {
        return await draftWinbackEmail(input.segmentKey, input.targetEventId);
      } catch (err) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err instanceof Error ? err.message : 'No se pudo redactar el correo.' });
      }
    }),
    createCampaign: adminProcedure.input(z.object({
      segmentKey: z.enum(WINBACK_SEGMENT_KEYS),
      targetEventId: z.number().optional(),
      content: MailingContentSchema,
    })).mutation(async ({ input }) => {
      try {
        return await createWinbackCampaign(input);
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo crear la campaña.' });
      }
    }),
  }),

  // Director comercial IA (server/salesStrategist.ts): estrategia de ventas
  // del próximo evento. adminProcedure en todo (no adminReadProcedure): leer
  // el reporte no cuesta, pero generarlo llama a la IA con costo, y mantener
  // el mismo nivel en las tres evita medias puertas.
  salesStrategy: router({
    get: adminProcedure.query(async () => {
      return normalizeSalesStrategyState(await db.getSalesStrategyState());
    }),
    run: adminProcedure.input(z.object({ eventId: z.number().optional() }).optional()).mutation(async ({ input }) => {
      try {
        return await runSalesStrategist({ trigger: 'manual', eventId: input?.eventId, email: false });
      } catch (err) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err instanceof Error ? err.message : 'No se pudo generar el reporte.' });
      }
    }),
    setWeekly: adminProcedure.input(z.object({ enabled: z.boolean() })).mutation(async ({ input }) => {
      await setSalesStrategyWeekly(input.enabled);
      return { success: true };
    }),
  }),

  instagram: router({
    getConfig: adminProcedure.query(async () => {
      const settings = await db.getSiteSettings();
      return normalizeInstagramAgentConfig((settings as any).instagramAgentConfig);
    }),
    saveConfig: adminProcedure.input(z.object({
      enabled: z.boolean(),
      brandNotes: z.string().max(4000),
      handoffMessage: z.string().min(1).max(IG_MAX_REPLY_CHARS),
      historyLimit: z.number().int().min(2).max(40),
      dailyReplyLimitPerThread: z.number().int().min(1).max(200),
      styleExamples: z.string().max(4000),
      followUpEnabled: z.boolean(),
      followUpMinutes: z.number().int().min(1).max(1440),
      followUpMessage: z.string().min(1).max(IG_MAX_REPLY_CHARS),
      thanksMessage: z.string().min(1).max(IG_MAX_REPLY_CHARS),
      autoResumeHours: z.number().int().min(0).max(720),
      salesPlaybook: z.string().max(6000),
      coachWeeklyEnabled: z.boolean(),
      commentsEnabled: z.boolean().optional(),
      hideSpam: z.boolean().optional(),
      welcomeEnabled: z.boolean().optional(),
      hooks: z.array(z.string().max(160)).max(20).optional(),
    })).mutation(async ({ input }) => {
      const current = normalizeInstagramAgentConfig((await db.getSiteSettings() as any).instagramAgentConfig);
      return db.updateSiteSettings({ instagramAgentConfig: { ...input, commentsEnabled: input.commentsEnabled ?? current.commentsEnabled, hideSpam: input.hideSpam ?? current.hideSpam, customLinkCodes: current.customLinkCodes, trustedAccounts: current.trustedAccounts, noAiAccounts: current.noAiAccounts, autoResumeMigrated: true, welcomeEnabled: input.welcomeEnabled ?? current.welcomeEnabled, hooks: input.hooks ?? current.hooks } });
    }),
    /* Cuentas de confianza sin IA: el agente nunca les contesta ni se les reactiva solo. */
    setNoAiAccount: adminProcedure.input(z.object({ username: z.string().max(60), noAi: z.boolean(), threadId: z.number().int().optional() })).mutation(async ({ input }) => {
      const username = normalizeIgUsername(input.username);
      if (!username) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Escribe un usuario de Instagram válido.' });
      const current = normalizeInstagramAgentConfig((await db.getSiteSettings() as any).instagramAgentConfig);
      const list = input.noAi ? Array.from(new Set([...current.noAiAccounts, username])) : current.noAiAccounts.filter((u) => u !== username);
      await db.updateSiteSettings({ instagramAgentConfig: { ...current, noAiAccounts: list } });
      // Si ya hay una conversación abierta con esa cuenta, queda pausada de una.
      if (input.noAi && input.threadId) await db.setIgThreadBotPaused(input.threadId, true, 'Cuenta de confianza: sin IA');
      return { noAiAccounts: list };
    }),
    /* Reactiva el agente en todas las conversaciones pausadas (menos las cuentas de confianza). */
    resumeAllThreads: adminProcedure.mutation(async () => {
      const current = normalizeInstagramAgentConfig((await db.getSiteSettings() as any).instagramAgentConfig);
      return { resumed: await db.resumeAllIgThreads(current.noAiAccounts) };
    }),
    /* Cuánto vendió el agente (Instagram + WhatsApp): órdenes aprobadas
     * que entraron por un botón del agente (utm_campaign=agente...). */
    /* Coach semanal: último reporte guardado, y botón para generarlo ya. */
    coachReport: adminProcedure.query(async () => {
      return normalizeAgentCoachReport(await db.getAgentCoachReport());
    }),
    runCoachNow: adminProcedure.mutation(async () => {
      try {
        return await runAgentCoach({ trigger: 'manual', email: false });
      } catch (err) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err instanceof Error ? err.message : 'No se pudo generar el reporte' });
      }
    }),
    /* Los botones que el agente manda con la información del sitio. */
    agentButtons: adminProcedure.query(() => AGENT_SITE_PAGES.map((p) => ({ path: p.path, label: p.buttonLabel, topic: p.topic }))),
    /* Embudo por origen: chats (links, anuncios, comentarios), clics en los
     * botones y compras, de los últimos `days` días. */
    funnel: adminProcedure.input(z.object({ days: z.number().int().min(1).max(90) })).query(async ({ input }) => {
      const raw = await db.getIgFunnelCounts(new Date(Date.now() - input.days * 24 * 60 * 60 * 1000));
      const insights = await getInstagramInsights();
      const posts = new Map(insights.posts.map((p) => [p.id, p.caption || INSIGHT_TYPE_LABEL[p.type]]));
      const labels = new Map<string, string>();
      const chats = raw.referrals.map((r) => {
        const origin = referralUtmContent(r) ?? `ref-${r.source}`;
        labels.set(origin, igReferralLabel(r).replace(/^./, (c) => c.toUpperCase()));
        return { origin, count: r.count };
      });
      for (const c of raw.commentDms) chats.push({ origin: postOrigin(c.mediaId) ?? 'agente-comentario', count: c.count });
      return buildFunnel({ chats, clicks: raw.clicks, orders: raw.orders, posts, labels });
    }),
    /* Fans frecuentes: 3+ comentarios o días con conversación en 30 días. */
    fans: adminProcedure.query(async () => {
      const counts = await db.getIgFanCounts();
      const ids = Array.from(counts.keys());
      const [threads, linked] = await Promise.all([db.getIgThreadsByUserIds(ids), db.listLinkedInstagramHandles()]);
      return ids.map((id) => {
        const t = threads.get(id);
        return { igUserId: id, threadId: t?.id ?? null, username: t?.username ?? null, name: t?.name ?? null, interactions: counts.get(id) ?? 0, isCustomer: !!t?.username && linked.has(normalizeIgHandle(t.username)) };
      }).sort((a, b) => b.interactions - a.interactions).slice(0, 50);
    }),
    /* Códigos propios del Kit de links (campañas). */
    setLinkCodes: adminProcedure.input(z.object({ codes: z.array(z.string().max(60)).max(50) })).mutation(async ({ input }) => {
      const current = normalizeInstagramAgentConfig((await db.getSiteSettings() as any).instagramAgentConfig);
      const codes = Array.from(new Set(input.codes.map(normalizeLinkCode).filter(Boolean)));
      await db.updateSiteSettings({ instagramAgentConfig: { ...current, customLinkCodes: codes } });
      return { codes };
    }),
    agentSales: adminProcedure.query(async () => {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const [last7Days, total] = await Promise.all([db.getAgentSalesSummary(weekAgo), db.getAgentSalesSummary()]);
      return { last7Days, total };
    }),
    /* Estado de la conexión con Meta, para que el panel pueda decir QUÉ
     * falta en vez de mostrar una bandeja vacía sin explicación. Solo
     * informa si cada variable está puesta -- nunca devuelve su valor. */
    connectionStatus: adminProcedure.query(async () => ({
      hasAppSecret: Boolean(process.env.IG_APP_SECRET),
      hasVerifyToken: Boolean(process.env.IG_VERIFY_TOKEN),
      hasAccessToken: Boolean(process.env.IG_ACCESS_TOKEN),
      hasUserId: Boolean(process.env.IG_USER_ID),
      webhookUrl: `${process.env.APP_URL || 'https://mansionplayroom.cl'}/api/webhooks/instagram`,
    })),
    listThreads: adminProcedure.query(async () => {
      const threads = await db.listIgThreads(100);
      // Conversaciones donde dicen "ya compré" y su @ aún no está en ninguna
      // ficha de cliente: se marcan para que el dueño las vincule.
      let toLink = new Set<number>();
      try {
        const [saying, linkedHandles] = await Promise.all([db.getIgThreadsSayingBought(threads.map((t) => t.id)), db.listLinkedInstagramHandles()]);
        toLink = new Set(Array.from(saying).filter((id) => {
          const t = threads.find((x) => x.id === id);
          return t && !linkedHandles.has(normalizeIgHandle(t.username));
        }));
      } catch (err) {
        console.error('[instagram] no se pudo calcular "por vincular"', err);
      }
      const origins = await db.latestIgReferrals(threads.map((t) => t.igUserId));
      const fans = await db.getIgFanCounts(threads.map((t) => t.igUserId));
      return threads.map((t) => {
        const origin = origins.get(t.igUserId);
        return {
          ...t,
          // La ventana de 24 horas de Meta se calcula acá y no en el cliente
          // para que el botón de responder no dependa del reloj del navegador.
          canReply: canReplyWithinWindow(t.lastInboundAt),
          needsCustomerLink: toLink.has(t.id),
          origin: origin ? igReferralLabel(origin) : null,
          isFan: fans.has(t.igUserId),
        };
      });
    }),
    customerLink: adminProcedure.input(z.object({ threadId: z.number() })).query(async ({ input }) => {
      const state = await getIgCustomerLinkState(input.threadId);
      if (!state) throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversación no encontrada' });
      return state;
    }),
    searchCustomersToLink: adminProcedure.input(z.object({ search: z.string().trim().min(2).max(80) })).query(async ({ input }) => {
      const rows = await db.listCustomers({ search: input.search });
      return rows.slice(0, 8).map((c: any) => ({ customerId: c.id as number, fullName: (c.fullName ?? null) as string | null, email: c.email as string, instagram: (c.instagram ?? null) as string | null }));
    }),
    linkCustomer: adminProcedure.input(z.object({ threadId: z.number(), customerId: z.number() })).mutation(async ({ input, ctx }) => {
      const thread = await db.getIgThreadById(input.threadId);
      if (!thread) throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversación no encontrada' });
      const handle = normalizeIgHandle(thread.username);
      if (!handle) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Esta conversación no tiene @ de Instagram, no se puede vincular.' });
      const result = await db.setCustomerInstagram(input.customerId, handle);
      if (!result) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente no encontrado' });
      await db.recordAdminAudit({ action: 'instagram.linkCustomer', targetType: 'customer', targetId: input.customerId, ip: clientIp(ctx), payload: { threadId: input.threadId, handle, previous: result.previous } });
      return { success: true };
    }),
    getThread: adminProcedure.input(z.object({ threadId: z.number() })).query(async ({ input }) => {
      const thread = await db.getIgThreadById(input.threadId);
      if (!thread) throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversación no encontrada' });
      const messages = await db.getIgMessages(input.threadId, 100);
      const origin = (await db.latestIgReferrals([thread.igUserId])).get(thread.igUserId);
      const isFan = (await db.getIgFanCounts([thread.igUserId])).has(thread.igUserId);
      return { thread: { ...thread, canReply: canReplyWithinWindow(thread.lastInboundAt), origin: origin ? igReferralLabel(origin) : null, isFan }, messages };
    }),
    markRead: adminProcedure.input(z.object({ threadId: z.number() })).mutation(async ({ input }) => {
      await db.markIgThreadRead(input.threadId);
      return { success: true };
    }),
    setBotPaused: adminProcedure.input(z.object({
      threadId: z.number(),
      paused: z.boolean(),
    })).mutation(async ({ input }) => {
      await db.setIgThreadBotPaused(input.threadId, input.paused, input.paused ? 'Lo tomó el equipo desde el panel' : null);
      return { success: true };
    }),
    /* Ficha del cliente editable a mano -- el agente la va armando solo,
     * pero el dueño puede corregirla o agregarle lo que sabe él. */
    setCustomerNotes: adminProcedure.input(z.object({
      threadId: z.number(),
      notes: z.string().max(1000),
    })).mutation(async ({ input }) => {
      await db.setIgThreadCustomerNotes(input.threadId, input.notes.trim() || null);
      return { success: true };
    }),
    // Irreversible (borra el hilo y todos sus mensajes) -- por eso pide la
    // clave de admin, a diferencia del resto de este router.
    deleteThread: adminPasswordProcedure.input(z.object({ threadId: z.number() })).mutation(async ({ input, ctx }) => {
      const result = await db.deleteIgThread(input.threadId);
      await db.recordAdminAudit({ action: 'instagram.deleteThread', targetType: 'igThread', targetId: input.threadId, ip: clientIp(ctx) });
      return result;
    }),
    reply: adminProcedure.input(z.object({
      threadId: z.number(),
      text: z.string().min(1).max(IG_MAX_REPLY_CHARS),
    })).mutation(async ({ input }) => {
      const thread = await db.getIgThreadById(input.threadId);
      if (!thread) throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversación no encontrada' });
      try {
        await sendManualInstagramReply({
          threadId: thread.id,
          igUserId: thread.igUserId,
          lastInboundAt: thread.lastInboundAt,
          text: input.text,
        });
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo enviar el mensaje' });
      }
      return { success: true };
    }),
    /* Prueba en seco: corre el agente con los datos reales de hoy y devuelve
     * lo que CONTESTARÍA, sin mandarle nada a nadie. Es lo que permite
     * afinar el tono y las notas de marca antes de prender el interruptor
     * sobre una cuenta pública. */
    preview: adminProcedure.input(z.object({
      message: z.string().min(1).max(1000),
      // La conversación de prueba hasta ahora (el agente lee el hilo completo) y, opcionalmente, el borrador sin
      // guardar: así se prueba lo que se acaba de escribir antes de publicarlo.
      history: z.array(z.object({ role: z.enum(['user', 'agent']), text: z.string().max(1000) })).max(12).optional(),
      draft: z.record(z.string(), z.unknown()).optional(),
    })).mutation(async ({ input }) => {
      const settings = await db.getSiteSettings();
      const config = normalizeInstagramAgentConfig(input.draft ?? (settings as any).instagramAgentConfig);
      const result = await runInstagramAgent({
        incomingText: input.message,
        history: (input.history ?? []).map((m) => ({ direction: m.role === 'user' ? 'in' as const : 'out' as const, text: m.text })),
        // La prueba ignora el interruptor maestro a propósito: sirve
        // justamente para decidir si prenderlo.
        config: { ...config, enabled: true },
      });
      return result;
    }),
    /* El bloque de datos tal cual lo ve la IA. Sin esto, cuando el agente
     * contesta algo raro no hay forma de saber si el problema es el prompt o
     * un evento mal cargado. */
    previewContext: adminProcedure.query(async () => ({
      context: await buildInstagramContext(),
      defaults: DEFAULT_INSTAGRAM_AGENT_CONFIG,
    })),
    /* Registro permanente de derivaciones (Instagram Y WhatsApp, cerebro
     * compartido) -- a diferencia del `handoffReason` de un hilo, que se
     * borra apenas se reactiva, esto queda como historial fijo para que el
     * dueño revise qué preguntas no supo resolver el agente y decida qué
     * agregar a `brandNotes`. Ver drizzle/schema.ts `agentHandoffLog`. */
    listHandoffLog: adminProcedure.query(async () => {
      return db.listAgentHandoffLog({ onlyPending: true });
    }),
    resolveHandoffLog: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await db.resolveAgentHandoffLog(input.id);
      return { success: true };
    }),
    listDismissedHandoffLog: adminProcedure.query(async () => db.listDismissedHandoffLog()),
    /* El dueño escribe la idea con sus palabras; la IA la convierte en datos
     * cortos que el agente usa al responder (server/agentLearning.ts). */
    teach: adminProcedure
      .input(z.object({ handoffId: z.number().optional(), idea: z.string().trim().min(3).max(1000) }))
      .mutation(async ({ input }) => {
        try {
          return await teachFromOwner({ idea: input.idea, handoffId: input.handoffId });
        } catch (err) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo guardar' });
        }
      }),
    listKnowledge: adminProcedure.query(async () => listKnowledge()),
    setKnowledgeStatus: adminProcedure
      .input(z.object({ id: z.number(), status: z.enum(['activo', 'revisar', 'pausado']) }))
      .mutation(async ({ input }) => { await setKnowledgeStatus(input.id, input.status); return { success: true }; }),
    updateKnowledgeText: adminProcedure
      .input(z.object({ id: z.number(), text: z.string().trim().min(3).max(1000) }))
      .mutation(async ({ input }) => { await updateKnowledgeText(input.id, input.text); return { success: true }; }),
    deleteKnowledge: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await deleteKnowledge(input.id);
      return { success: true };
    }),
  }),

  /* Bandeja del agente de WhatsApp (server/whatsapp.ts). Espejo del router
   * de Instagram -- mismo criterio de `adminProcedure` para todo, lecturas
   * incluidas. El conocimiento del agente (notas de marca, tono, mensaje de
   * derivación) se edita en `instagram.saveConfig` y lo comparten los dos
   * canales; acá solo va lo propio de WhatsApp. */
  whatsapp: router({
    getConfig: adminProcedure.query(async () => {
      const settings = await db.getSiteSettings();
      return normalizeWhatsAppAgentConfig((settings as any).whatsappAgentConfig);
    }),
    saveConfig: adminProcedure.input(z.object({
      enabled: z.boolean(),
      welcomeMenuEnabled: z.boolean(),
      welcomeMessage: z.string().min(1).max(1000),
      dailyReplyLimitPerThread: z.number().int().min(1).max(200),
      followUpEnabled: z.boolean(),
      followUpMinutes: z.number().int().min(1).max(1440),
      followUpMessage: z.string().min(1).max(WA_MAX_REPLY_CHARS),
    })).mutation(async ({ input }) => {
      return db.updateSiteSettings({ whatsappAgentConfig: input });
    }),
    connectionStatus: adminProcedure.query(async () => ({
      hasAppSecret: Boolean(process.env.WA_APP_SECRET),
      hasVerifyToken: Boolean(process.env.WA_VERIFY_TOKEN),
      hasAccessToken: Boolean(process.env.WA_ACCESS_TOKEN),
      hasPhoneNumberId: Boolean(process.env.WA_PHONE_NUMBER_ID),
      webhookUrl: `${process.env.APP_URL || 'https://mansionplayroom.cl'}/api/webhooks/whatsapp`,
    })),
    listThreads: adminProcedure.query(async () => {
      const threads = await db.listWaThreads(100);
      return threads.map((t) => ({ ...t, canReply: canReplyWithinWindow(t.lastInboundAt) }));
    }),
    getThread: adminProcedure.input(z.object({ threadId: z.number() })).query(async ({ input }) => {
      const thread = await db.getWaThreadById(input.threadId);
      if (!thread) throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversación no encontrada' });
      const messages = await db.getWaMessages(input.threadId, 100);
      return { thread: { ...thread, canReply: canReplyWithinWindow(thread.lastInboundAt) }, messages };
    }),
    markRead: adminProcedure.input(z.object({ threadId: z.number() })).mutation(async ({ input }) => {
      await db.markWaThreadRead(input.threadId);
      return { success: true };
    }),
    setBotPaused: adminProcedure.input(z.object({
      threadId: z.number(),
      paused: z.boolean(),
    })).mutation(async ({ input }) => {
      await db.setWaThreadBotPaused(input.threadId, input.paused, input.paused ? 'Lo tomó el equipo desde el panel' : null);
      return { success: true };
    }),
    /* Ficha del cliente editable a mano -- el agente la va armando solo,
     * pero el dueño puede corregirla o agregarle lo que sabe él. */
    setCustomerNotes: adminProcedure.input(z.object({
      threadId: z.number(),
      notes: z.string().max(1000),
    })).mutation(async ({ input }) => {
      await db.setWaThreadCustomerNotes(input.threadId, input.notes.trim() || null);
      return { success: true };
    }),
    deleteThread: adminPasswordProcedure.input(z.object({ threadId: z.number() })).mutation(async ({ input, ctx }) => {
      const result = await db.deleteWaThread(input.threadId);
      await db.recordAdminAudit({ action: 'whatsapp.deleteThread', targetType: 'waThread', targetId: input.threadId, ip: clientIp(ctx) });
      return result;
    }),
    reply: adminProcedure.input(z.object({
      threadId: z.number(),
      text: z.string().min(1).max(WA_MAX_REPLY_CHARS),
    })).mutation(async ({ input }) => {
      const thread = await db.getWaThreadById(input.threadId);
      if (!thread) throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversación no encontrada' });
      try {
        await sendManualWhatsAppReply({
          threadId: thread.id,
          waId: thread.waId,
          lastInboundAt: thread.lastInboundAt,
          text: input.text,
        });
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo enviar el mensaje' });
      }
      return { success: true };
    }),
    /* Prueba en seco con el canal WhatsApp: devuelve también los botones y
     * la acción (lista de fechas / botón de compra) que se mostrarían. */
    preview: adminProcedure.input(z.object({
      message: z.string().min(1).max(1000),
    })).mutation(async ({ input }) => {
      const settings = await db.getSiteSettings();
      const config = normalizeInstagramAgentConfig((settings as any).instagramAgentConfig);
      return runInstagramAgent({
        incomingText: input.message,
        history: [],
        config: { ...config, enabled: true },
        channel: 'whatsapp',
      });
    }),
    defaults: adminProcedure.query(() => DEFAULT_WHATSAPP_AGENT_CONFIG),
  }),

  // Automatizaciones por palabra clave: comentar o responder a una historia
  // con la palabra justa dispara un DM (link, mensaje, o código de
  // descuento). El código de descuento es opcional -- mismo `discountCodes`
  // de siempre, generado con el mismo patrón que ya usa Promo Flash. Las de
  // `triggerSource: 'comment'`/`'both'` no hacen nada todavía en
  // producción: Meta exige un permiso aparte (`instagram_business_manage_comments`,
  // Advanced Access) que hoy no está aprobado -- ver docs/INSTAGRAM-AGENT.md.
  instagramComments: router({
    list: adminProcedure.input(z.object({ status: z.enum(['pending', 'sent', 'discarded', 'hidden', 'failed', 'all']) })).query(async ({ input }) => {
      const rows = await db.listIgComments(input.status);
      // La publicación donde comentaron (miniatura y pie de foto), si está entre las recientes.
      const posts = rows.some((r) => r.mediaId) ? new Map((await getInstagramInsights()).posts.map((p) => [p.id, p])) : new Map();
      const fans = await db.getIgFanCounts(Array.from(new Set(rows.map((r) => r.igUserId))));
      return rows.map((r) => {
        const p = r.mediaId ? posts.get(r.mediaId) : undefined;
        return { ...r, isFan: fans.has(r.igUserId), post: p ? { caption: p.caption.slice(0, 120), thumbnail: p.thumbnail, permalink: p.permalink } : null };
      });
    }),
    pendingCount: adminProcedure.query(async () => db.countPendingIgComments()),
    /* Aprobar = publicar la respuesta (editada o no) y mandar el DM si hay. */
    approve: adminProcedure.input(z.object({ id: z.number().int(), reply: z.string().min(1).max(600), dm: z.string().max(1000).nullable().optional() })).mutation(async ({ input }) => {
      try {
        return await approveComment(input.id, input.reply, input.dm);
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo publicar.' });
      }
    }),
    /* Publicaciones recientes, para pedir un comentario propio que abra conversación. */
    recentPosts: adminProcedure.query(async () => {
      const posts = (await getInstagramInsights()).posts.slice(0, 9);
      return Promise.all(posts.map(async (p) => ({ id: p.id, caption: p.caption.slice(0, 120), thumbnail: p.thumbnail, permalink: p.permalink, type: p.type, hasDraft: await db.hasOwnCommentDraft(p.id) })));
    }),
    suggestOwn: adminProcedure.input(z.object({ mediaId: z.string().min(1).max(64) })).mutation(async ({ input }) => {
      try {
        const row = await suggestOwnComment(input.mediaId);
        return { id: row?.id ?? null };
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo sugerir el comentario.' });
      }
    }),
    discard: adminProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input }) => {
      await db.decideIgComment(input.id, { status: 'discarded' });
      return { success: true };
    }),
    setSettings: adminProcedure.input(z.object({ commentsEnabled: z.boolean(), hideSpam: z.boolean() })).mutation(async ({ input }) => {
      const current = normalizeInstagramAgentConfig((await db.getSiteSettings() as any).instagramAgentConfig);
      return db.updateSiteSettings({ instagramAgentConfig: { ...current, ...input } });
    }),
    /* "No es spam": lo muestra de nuevo en Instagram y confía en esa cuenta. */
    notSpam: adminProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input }) => {
      try {
        return await restoreSpamComment(input.id);
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo recuperar el comentario.' });
      }
    }),
    /* Cuentas de confianza: sus comentarios nunca se ocultan como spam. */
    setTrustedAccounts: adminProcedure.input(z.object({ accounts: z.array(z.string().max(40)).max(100) })).mutation(async ({ input }) => {
      const current = normalizeInstagramAgentConfig((await db.getSiteSettings() as any).instagramAgentConfig);
      const config = normalizeInstagramAgentConfig({ ...current, trustedAccounts: input.accounts });
      await db.updateSiteSettings({ instagramAgentConfig: config });
      return { trustedAccounts: config.trustedAccounts };
    }),
  }),

  // Co-producción con otra productora (ej. Playroom × Dalmore), ver
  // server/coproduction.ts. `partnerProcedure`: al socio se le fija SU
  // co-producción desde la sesión; el dueño la elige por `slug`.
  coproduction: router({
    me: partnerProcedure.input(coproductionScopeInput).query(async ({ input, ctx }) => {
      const cp = await scopedCoproduction(ctx, input);
      const event = cp.eventId ? await db.getEventById(cp.eventId) : null;
      return {
        slug: cp.slug, partnerName: cp.partnerName, isLive: cp.isLive === 1, splitPercentPartner: cp.splitPercentPartner,
        capacity: normalizeLanding(cp.landing).capacity,
        viewer: ctx.user.role === 'partner' ? 'partner' as const : 'playroom' as const,
        event: event ? { id: event.id, title: event.title, slug: event.slug, eventDate: event.eventDate, status: event.status } : null,
      };
    }),
    overview: partnerProcedure.input(coproductionScopeInput).query(async ({ input, ctx }) => {
      return coproductionSvc.getCoproductionOverview(await scopedCoproduction(ctx, input));
    }),
    attendees: partnerProcedure.input(coproductionScopeInput).query(async ({ input, ctx }) => {
      return coproductionSvc.getCoproductionAttendees(await scopedCoproduction(ctx, input));
    }),
    createInvite: partnerProcedure.input(coproductionScopeBase.extend({
      buyerName: z.string().trim().min(1).max(255),
      buyerEmail: z.string().trim().email(),
      buyerPhone: z.string().trim().max(20).optional(),
      ticketTypeId: z.number().int(),
      quantity: z.number().int().min(1).max(20),
    })).mutation(async ({ input, ctx }) => {
      const cp = await scopedCoproduction(ctx, input);
      try {
        const result = await coproductionSvc.createCoproductionInvite(cp, input, ctx.user.role === 'partner' ? 'partner' : 'playroom');
        await confirmFreeOrder(result.orderNumber);
        return { orderNumber: result.orderNumber };
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo crear la cortesía.' });
      }
    }),
    expenses: partnerProcedure.input(coproductionScopeInput).query(async ({ input, ctx }) => {
      return coproductionSvc.listCoproductionExpenses(await scopedCoproduction(ctx, input));
    }),
    createExpense: partnerProcedure.input(coproductionScopeBase.extend({
      category: z.enum(coproductionSvc.COPRODUCTION_EXPENSE_CATEGORIES),
      description: z.string().trim().min(1).max(255),
      supplier: z.string().trim().max(160).optional(),
      documentType: z.enum(coproductionSvc.COPRODUCTION_DOCUMENT_TYPES),
      amountTotal: z.number().int().min(1).max(500_000_000),
      expenseDate: z.coerce.date(),
      receiptUrl: z.string().url().max(500).optional(),
    })).mutation(async ({ input, ctx }) => {
      const cp = await scopedCoproduction(ctx, input);
      try {
        return await coproductionSvc.createCoproductionExpense(cp, input, ctx.user.role === 'partner' ? 'partner' : 'playroom');
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo guardar el gasto.' });
      }
    }),
    split: partnerProcedure.input(coproductionScopeInput).query(async ({ input, ctx }) => {
      return coproductionSvc.getCoproductionSplit(await scopedCoproduction(ctx, input));
    }),

    // Solo el dueño.
    list: adminReadProcedure.query(async () => {
      return (await coproductionSvc.listCoproductions()).map((cp) => ({ slug: cp.slug, partnerName: cp.partnerName, isLive: cp.isLive === 1 }));
    }),
    setupGet: adminReadProcedure.input(z.object({ slug: z.string().max(50) })).query(async ({ input }) => {
      const cp = await coproductionSvc.getCoproductionBySlug(input.slug);
      if (!cp) return null;
      return {
        slug: cp.slug, partnerName: cp.partnerName, eventId: cp.eventId, splitPercentPartner: cp.splitPercentPartner,
        isLive: cp.isLive === 1, previewToken: cp.previewToken, hasPassword: !!cp.passwordHash,
        partnerTotpConfigured: !!cp.totpConfirmedAt, landing: normalizeLanding(cp.landing),
      };
    }),
    setupUpdate: adminProcedure.input(z.object({
      slug: z.string().max(50),
      eventId: z.number().int().nullable().optional(),
      splitPercentPartner: z.number().int().min(0).max(100).optional(),
      partnerName: z.string().trim().min(1).max(100).optional(),
      landing: z.record(z.string(), z.unknown()).optional(),
    })).mutation(async ({ input }) => {
      const cp = await requireCoproduction(input.slug);
      try {
        await coproductionSvc.updateCoproductionSetup(cp.id, { ...input, landing: input.landing as any });
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo guardar.' });
      }
      return { success: true };
    }),
    resetPartnerPassword: adminPasswordProcedure.input(z.object({ slug: z.string().max(50), adminPassword: z.string() })).mutation(async ({ input }) => {
      const cp = await requireCoproduction(input.slug);
      return { password: await coproductionSvc.resetPartnerPassword(cp.id) };
    }),
    revokePartnerAccess: adminProcedure.input(z.object({ slug: z.string().max(50) })).mutation(async ({ input }) => {
      await coproductionSvc.revokePartnerAccess((await requireCoproduction(input.slug)).id);
      return { success: true };
    }),
    rotatePreviewToken: adminProcedure.input(z.object({ slug: z.string().max(50) })).mutation(async ({ input }) => {
      return { previewToken: await coproductionSvc.rotatePreviewToken((await requireCoproduction(input.slug)).id) };
    }),
    setLive: adminProcedure.input(z.object({ slug: z.string().max(50), live: z.boolean() })).mutation(async ({ input }) => {
      try {
        await coproductionSvc.setCoproductionLive((await requireCoproduction(input.slug)).id, input.live);
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo cambiar.' });
      }
      return { success: true };
    }),
    approveExpense: adminProcedure.input(z.object({ slug: z.string().max(50), id: z.number().int() })).mutation(async ({ input }) => {
      try {
        await coproductionSvc.approveCoproductionExpense(await requireCoproduction(input.slug), input.id);
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo aprobar.' });
      }
      return { success: true };
    }),
    rejectExpense: adminProcedure.input(z.object({ slug: z.string().max(50), id: z.number().int(), reason: z.string().max(255).default('') })).mutation(async ({ input }) => {
      try {
        await coproductionSvc.rejectCoproductionExpense(await requireCoproduction(input.slug), input.id, input.reason);
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo rechazar.' });
      }
      return { success: true };
    }),

    // Landing pública: sin activar solo muestra "Próximamente", salvo con el
    // link de vista previa. Nunca expone la clave ni nada del panel.
    publicGet: publicProcedure.input(z.object({ slug: z.string().max(50), preview: z.string().max(64).optional() })).query(async ({ input, ctx }) => {
      const cp = await coproductionSvc.getCoproductionBySlug(input.slug);
      if (!cp) return null;
      const isLive = cp.isLive === 1;
      const previewOk = !isLive && !!input.preview && safeCompare(input.preview, cp.previewToken);
      const full = isLive || previewOk || ctx.user?.role === 'admin';
      const landing = normalizeLanding(cp.landing);
      if (!full) {
        return { isLive: false, preview: false, partnerName: cp.partnerName, landing: { ...landing, galleryUrls: [], faq: [] }, event: null, ticketTypes: [] };
      }
      const event = cp.eventId ? await db.getEventById(cp.eventId) : null;
      const types = event ? await db.getTicketTypesByEventId(event.id) : [];
      return {
        isLive, preview: !isLive, partnerName: cp.partnerName, landing,
        event: event ? { slug: event.slug, title: event.title, eventDate: event.eventDate, imageUrl: event.imageUrl } : null,
        ticketTypes: types.filter((t: any) => t.status !== 'hidden').map((t: any) => ({ id: t.id, name: t.name, price: Number(t.price), status: t.status, accesoSlug: t.accesoSlug })),
      };
    }),
  }),

  instagramAutomations: router({
    list: adminProcedure.query(() => db.listIgKeywordAutomationsWithStats()),
    /* Páginas que se pueden elegir como botón (la misma lista cerrada del agente). */
    buttonPages: adminProcedure.query(() => AGENT_SITE_PAGES.map((p) => ({ path: p.path, topic: p.topic }))),
    setFollowersOnly: adminProcedure.input(z.object({ id: z.number(), followersOnly: z.boolean() })).mutation(async ({ input }) => {
      try {
        await db.setIgKeywordAutomationFollowersOnly(input.id, input.followersOnly);
      } catch {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Falta correr la migración de "solo seguidores" en la base.' });
      }
      return { success: true };
    }),
    setGiftPerPerson: adminProcedure.input(z.object({ id: z.number(), perPerson: z.boolean() })).mutation(async ({ input }) => {
      await db.setIgKeywordAutomationGiftPerPerson(input.id, input.perPerson);
      return { success: true };
    }),
    setButton: adminProcedure.input(z.object({ id: z.number(), button: automationButtonSchema })).mutation(async ({ input }) => {
      await db.setIgKeywordAutomationButton(input.id, input.button);
      return { success: true };
    }),
    // IA: arma el mensaje del DM a partir de lo que ya está configurado en
    // el formulario (palabra clave, dónde aplica, recompensa) + una idea
    // libre y opcional (no se guarda, ver server/instagramAutomationDraft.ts).
    generateReplyDraft: adminProcedure.input(z.object({
      keyword: z.string().min(1).max(120),
      triggerSource: z.enum(['comment', 'story_reply', 'both']),
      idea: z.string().max(500).optional(),
      reward: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('none') }),
        z.object({
          kind: z.literal('discount'),
          discountType: z.enum(['percentage', 'fixed']),
          discountValue: z.number().positive(),
        }),
        z.object({
          kind: z.literal('gift'),
          productName: z.string(),
        }),
      ]),
    })).mutation(async ({ input }) => {
      try {
        return await generateAutomationReplyDraft(input);
      } catch (err) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err instanceof Error ? err.message : 'No se pudo generar el mensaje.' });
      }
    }),
    save: adminProcedure.input(z.object({
      id: z.number().optional(),
      keyword: z.string().min(1).max(120),
      triggerSource: z.enum(['comment', 'story_reply', 'both']),
      replyMessage: z.string().min(1).max(1000),
      button: automationButtonSchema.optional(),
      // Una automatización regala UNA cosa a la vez -- descuento en dinero
      // O un producto de la Carta, nunca los dos juntos (si más adelante
      // hace falta combinarlos, es una vuelta aparte).
      reward: z.discriminatedUnion('kind', [
        z.object({
          kind: z.literal('discount'),
          discountType: z.enum(['percentage', 'fixed']),
          discountValue: z.number().positive(),
          maxUses: z.number().int().positive().optional(),
          validUntil: z.string().optional(),
        }),
        z.object({
          kind: z.literal('gift'),
          giftTicketTypeId: z.number(),
          perPerson: z.boolean().optional(),
          maxUses: z.number().int().positive().optional(),
          validUntil: z.string().optional(),
        }),
      ]).optional(),
    })).mutation(async ({ input }) => {
      if (input.id) {
        await db.updateIgKeywordAutomation(input.id, {
          keyword: input.keyword,
          triggerSource: input.triggerSource,
          replyMessage: input.replyMessage,
        });
        return { success: true };
      }

      // Solo se genera un código de descuento si esta campaña de verdad
      // regala algo -- una automatización que solo manda un link o un
      // mensaje nunca toca `discountCodes`.
      let discountCode: string | null = null;
      if (input.reward) {
        discountCode = `AUTO${nanoid(4).toUpperCase()}`;
        await db.createDiscountCode({
          code: discountCode,
          description: `Automatización de Instagram: "${input.keyword}"`,
          // Un código de "producto de regalo" no descuenta plata -- lo que
          // regala es el producto (giftTicketTypeId), generado como
          // orderItem de $0 al aprobarse la orden (server/webhooks.ts).
          discountType: input.reward.kind === 'gift' ? 'fixed' : input.reward.discountType,
          discountValue: input.reward.kind === 'gift' ? 0 : input.reward.discountValue,
          giftTicketTypeId: input.reward.kind === 'gift' ? input.reward.giftTicketTypeId : undefined,
          maxUses: input.reward.maxUses,
          validUntil: input.reward.validUntil ? new Date(input.reward.validUntil) : undefined,
          isActive: 1,
        });
      }

      await db.createIgKeywordAutomation({
        keyword: input.keyword,
        triggerSource: input.triggerSource,
        replyMessage: input.replyMessage,
        discountCode,
        button: input.button,
        giftPerPerson: input.reward?.kind === 'gift' ? input.reward.perPerson : undefined,
      });
      return { success: true };
    }),
    setActive: adminProcedure.input(z.object({
      id: z.number(),
      active: z.boolean(),
    })).mutation(async ({ input }) => {
      await db.setIgKeywordAutomationActive(input.id, input.active);
      return { success: true };
    }),
    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await db.deleteIgKeywordAutomation(input.id);
      return { success: true };
    }),
  }),

  // Editor de textos + interruptores por sección del correo de compra, y
  // botón de "mandar prueba" a una casilla cualquiera con cualquiera de los
  // 4 correos de cara al cliente -- ver shared/emailTemplateConfig.ts para
  // el porqué del alcance (solo buildOrderEmail tiene secciones largas
  // desacoplables; los otros 3 son cortos y no las necesitan).
  emailTemplates: router({
    getConfig: adminReadProcedure.query(async () => {
      const settings = await db.getSiteSettings();
      return normalizeOrderEmailConfig((settings.emailTemplateConfig as any)?.orderEmail);
    }),
    saveConfig: adminProcedure.input(z.object({
      sections: z.object({
        quienesSomos: z.boolean(),
        encontraras: z.boolean(),
        antesDeVenir: z.boolean(),
        valores: z.boolean(),
        embajador: z.boolean(),
        faq: z.boolean(),
      }),
      greetingText: z.string().min(1),
      farewellText: z.string().min(1),
    })).mutation(async ({ input }) => {
      return db.updateSiteSettings({ emailTemplateConfig: { orderEmail: input } });
    }),
    // Vista previa en vivo del correo de compra con la config todavía sin
    // guardar (mismo patrón que mailing.renderPreview) -- datos de muestra,
    // nunca datos reales de una orden.
    renderPreview: adminProcedure.input(z.object({
      sections: z.object({
        quienesSomos: z.boolean(),
        encontraras: z.boolean(),
        antesDeVenir: z.boolean(),
        valores: z.boolean(),
        embajador: z.boolean(),
        faq: z.boolean(),
      }),
      greetingText: z.string(),
      farewellText: z.string(),
    })).mutation(async ({ input }) => {
      const eventFields = await resolveOrderPreviewEventFields();
      return { html: buildOrderEmail({ ...SAMPLE_ORDER_EMAIL_DATA, ...eventFields, templateConfig: input as OrderEmailConfig }) };
    }),
    sendTest: adminProcedure.input(z.object({
      toEmail: z.string().email(),
      templateType: z.enum(['order', 'missionTopup', 'pendingReminder', 'gift']),
    })).mutation(async ({ input }) => {
      let html: string;
      let subject: string;
      switch (input.templateType) {
        case 'order': {
          const settings = await db.getSiteSettings();
          const templateConfig = normalizeOrderEmailConfig((settings.emailTemplateConfig as any)?.orderEmail);
          const eventFields = await resolveOrderPreviewEventFields();
          html = buildOrderEmail({ ...SAMPLE_ORDER_EMAIL_DATA, ...eventFields, templateConfig });
          subject = '[PRUEBA] Tu compra fue confirmada';
          break;
        }
        case 'missionTopup': {
          const eventFields = await resolveMissionTopupPreviewEventFields();
          html = buildMissionTopupEmail({ ...SAMPLE_MISSION_TOPUP_DATA, ...eventFields });
          subject = '[PRUEBA] Casi -- falta completar tu diferencia';
          break;
        }
        case 'pendingReminder':
          html = buildPendingReminderEmail(SAMPLE_PENDING_REMINDER_DATA);
          subject = '[PRUEBA] Quedó pendiente tu acceso';
          break;
        case 'gift':
          html = buildGiftEmail(SAMPLE_GIFT_DATA);
          subject = '[PRUEBA] Te invitaron un trago';
          break;
      }
      const result = await sendEmail({ to: input.toEmail, subject, html });
      if (!result.success) throw new Error('Resend rechazó el envío -- revisa la configuración de RESEND_API_KEY/RESEND_FROM_EMAIL en Vercel.');
      return { success: true };
    }),
  }),

  communityCodes: router({
    validate: publicProcedure.input(z.object({
      code: z.string(),
      // Solo importa cuando el código es personal (ownerRut asignado) --
      // ver validateCommunityCode en db.ts.
      buyerRut: z.string().optional(),
      eventId: z.number().optional(),
    })).mutation(async ({ input }) => {
      return db.validateCommunityCode(input.code, input.buyerRut, input.eventId);
    }),
    // Admin
    listAll: adminReadProcedure.query(async () => {
      return db.getAllCommunityCodes();
    }),
    create: adminProcedure.input(z.object({
      code: z.string(),
      label: z.string().optional(),
      maxUses: z.number().optional(),
      // RUT de la persona dueña, para un código personal y permanente
      // (ver drizzle/schema.ts) -- vacío/omitido = código compartido,
      // igual que siempre.
      ownerRut: z.string().optional(),
    })).mutation(async ({ input }) => {
      return db.createCommunityCode(input);
    }),
    update: adminProcedure.input(z.object({
      id: z.number(),
      code: z.string().optional(),
      label: z.string().optional(),
      maxUses: z.number().optional(),
      isActive: z.number().optional(),
      ownerRut: z.string().optional(),
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      return db.updateCommunityCode(id, data);
    }),
    delete: adminPasswordProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const result = await db.deleteCommunityCode(input.id);
      await db.recordAdminAudit({ action: 'communityCodes.delete', targetType: 'communityCode', targetId: input.id, ip: clientIp(ctx) });
      return result;
    }),
  }),

  // Campañas aliadas: link privado con precio especial por persona (hoy
  // /electronica, la comunidad del B2B Aldo Medel x German Courtin).
  partner: router({
    /* Lo que necesita el link público: precios, textos y si está abierto. */
    get: publicProcedure.input(z.object({ slug: z.string().max(50) })).query(async ({ input }) => {
      return partnerSvc.getPublicPartnerCampaign(input.slug);
    }),
    /* ¿Puede comprar por el link? (no si ya es cliente de Playroom) -- y si
     * puede, recién acá recibe los precios de la campaña. Con
     * límite por IP: dice algo sobre si un email/RUT ya compró, así que no
     * puede quedar abierto para probar listas enteras. */
    checkEligibility: publicProcedure.input(z.object({
      slug: z.string().max(50),
      email: z.string().email(),
      rut: z.string().max(20).optional(),
    })).mutation(async ({ input, ctx }) => {
      const ipKey = `partner-eligibility:${clientIp(ctx)}`;
      if (!(await db.checkIpRateLimit(ipKey))) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Prueba de nuevo en un rato.' });
      }
      // 60 cada 30 min: holgado para un grupo comprando desde la misma red
      // (datos móviles comparten IP), y aún así frena probar listas enteras.
      await db.recordIpAttempt(ipKey, 60, 30 * 60 * 1000);
      const campaign = await partnerSvc.getPartnerCampaignBySlug(input.slug);
      if (!campaign) throw new TRPCError({ code: 'NOT_FOUND', message: 'Este link no está disponible.' });
      const existing = await partnerSvc.isExistingPlayroomCustomer({ email: input.email, rut: input.rut, campaignSlug: input.slug });
      // El precio especial viaja SOLO en esta respuesta y solo si puede comprar.
      return existing ? { eligible: false as const } : { eligible: true as const, pricing: partnerSvc.getPartnerPricing(campaign) };
    }),
    adminGet: adminReadProcedure.input(z.object({ slug: z.string().max(50) }).optional()).query(async ({ input }) => {
      return partnerSvc.getPartnerCampaignForAdmin(input?.slug ?? partnerSvc.ELECTRONICA_SLUG);
    }),
    adminUpdate: adminProcedure.input(z.object({
      slug: z.string().max(50).optional(),
      isActive: z.boolean().optional(),
      pricePerPerson: z.number().int().min(0).max(1_000_000).optional(),
      maxPersons: z.number().int().min(1).max(100_000).nullable().optional(),
      headline: z.string().max(255).nullable().optional(),
      rulesText: z.string().max(5000).nullable().optional(),
      label: z.string().max(100).optional(),
      setTimeText: z.string().max(120).nullable().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { slug, ...patch } = input;
      const result = await partnerSvc.updatePartnerCampaign(slug ?? partnerSvc.ELECTRONICA_SLUG, patch);
      await db.recordAdminAudit({ action: 'partner.update', targetType: 'partnerCampaign', targetId: result?.id ?? 0, ip: clientIp(ctx) });
      return result;
    }),
    /* Recordatorio previo a la fiesta a toda la comunidad (una vez por compra). */
    sendReminder: adminProcedure.input(z.object({ slug: z.string().max(50).optional() }).optional()).mutation(async ({ input, ctx }) => {
      const slug = input?.slug ?? partnerSvc.ELECTRONICA_SLUG;
      const result = await partnerSvc.sendPartnerReminders(slug);
      await db.recordAdminAudit({ action: 'partner.sendReminder', targetType: 'partnerCampaign', targetId: slug, payload: result, ip: clientIp(ctx) });
      return result;
    }),
    /* Agradecimiento post-fiesta con beneficio, solo a quienes entraron. */
    sendThanks: adminProcedure.input(z.object({
      slug: z.string().max(50).optional(),
      discountCode: z.string().trim().min(1).max(50),
      benefitText: z.string().trim().min(1).max(300),
    })).mutation(async ({ input, ctx }) => {
      const slug = input.slug ?? partnerSvc.ELECTRONICA_SLUG;
      const result = await partnerSvc.sendPartnerThanks(slug, input);
      await db.recordAdminAudit({ action: 'partner.sendThanks', targetType: 'partnerCampaign', targetId: slug, payload: result, ip: clientIp(ctx) });
      return result;
    }),
  }),

  /* Concursos de Instagram (admin → Comunidad → Concursos). El motor que
   * corre solo (webhook, compras, sorteo) vive en server/contests.ts. */
  contests: router({
    public: publicProcedure.query(() => contestSvc.getPublicContestCached().catch(() => null)),
    list: adminReadProcedure.query(() => contestSvc.listContests().catch(() => {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Falta correr la migración 0109 (concursos) en la base.' });
    })),
    get: adminReadProcedure.input(z.object({ id: z.number().int() })).query(({ input }) => contestSvc.getContestAdmin(input.id)),
    ticketTypes: adminReadProcedure.input(z.object({ eventId: z.number().int() })).query(({ input }) => contestSvc.listContestTicketTypes(input.eventId)),
    /* Últimas publicaciones de la cuenta, para elegir la del concurso. */
    media: adminReadProcedure.query(async () => {
      try {
        return normalizeMedia(await fetchOwnMedia(25));
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudieron leer las publicaciones.' });
      }
    }),
    create: adminProcedure.input(z.object({
      eventId: z.number().int(), title: z.string().max(160).optional(),
      template: z.enum(['ranking', 'draw', 'likes', 'referrals', 'milestones', 'quiz', 'flash', 'countdown', 'photo']).optional(),
      prizeTicketTypeId: z.number().int().nullable().optional(),
      mediaId: z.string().max(64).nullable().optional(), mediaPermalink: z.string().max(300).nullable().optional(), mediaImage: z.string().nullable().optional(),
      startsAt: z.string().optional(), drawAt: z.string().optional(),
      keyword: z.string().max(80).optional(), keywordPhrase: z.string().max(80).optional(),
    })).mutation(async ({ input, ctx }) => {
      const { eventId, title, ...opts } = input;
      const result = await contestSvc.createContest(eventId, title, opts);
      await db.recordAdminAudit({ action: 'contest.create', targetType: 'contest', targetId: result.id, ip: clientIp(ctx) });
      return result;
    }),
    update: adminProcedure.input(z.object({
      id: z.number().int(),
      title: z.string().max(160).optional(),
      config: z.unknown().optional(),
      mediaId: z.string().max(64).nullable().optional(),
      mediaPermalink: z.string().max(300).nullable().optional(),
      mediaImage: z.string().max(2000).nullable().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, ...patch } = input;
      const result = await contestSvc.updateContest(id, patch);
      await db.recordAdminAudit({ action: 'contest.update', targetType: 'contest', targetId: id, ip: clientIp(ctx) });
      return result;
    }),
    setStatus: adminProcedure.input(z.object({ id: z.number().int(), status: z.enum(['draft', 'active', 'paused', 'finished']) })).mutation(async ({ input, ctx }) => {
      try {
        const result = await contestSvc.setContestStatus(input.id, input.status);
        await db.recordAdminAudit({ action: `contest.${input.status}`, targetType: 'contest', targetId: input.id, payload: result, ip: clientIp(ctx) });
        return result;
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo cambiar el estado.' });
      }
    }),
    /* Ranking: la tabla del panel, el botón «publicar ahora» y la página
     * personal «mi posición» (pública, por el código de invitación). */
    rankingAdmin: adminReadProcedure.input(z.object({ id: z.number().int() })).query(({ input }) => rankingSvc.getRankingAdmin(input.id)),
    publishRanking: adminProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input, ctx }) => {
      try {
        const result = await rankingSvc.publishRankingNow(input.id);
        await db.recordAdminAudit({ action: 'contest.publishRanking', targetType: 'contest', targetId: input.id, payload: result, ip: clientIp(ctx) });
        return result;
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo publicar el ranking.' });
      }
    }),
    position: publicProcedure.input(z.object({ code: z.string().max(32) })).query(async ({ input, ctx }) => {
      // Los códigos son cortos: se limitan las consultas por IP para que nadie los recorra.
      const ipKey = `contest-position:${clientIp(ctx)}`;
      if (!(await db.checkIpRateLimit(ipKey))) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Demasiadas consultas. Prueba de nuevo en un rato.' });
      await db.recordIpAttempt(ipKey, 120, 10 * 60 * 1000);
      return rankingSvc.getPersonalPosition(input.code).catch(() => null);
    }),
    resendWelcomes: adminProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input, ctx }) => {
      try {
        const result = await contestSvc.resendWelcomeDms(input.id);
        await db.recordAdminAudit({ action: 'contest.resendWelcomes', targetType: 'contest', targetId: input.id, payload: result, ip: clientIp(ctx) });
        return result;
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo reenviar.' });
      }
    }),
    syncNow: adminProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input }) => {
      try {
        return await contestSvc.syncContestComments(input.id);
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudieron leer los comentarios.' });
      }
    }),
    drawNow: adminProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input, ctx }) => {
      const result = await contestSvc.runContestDraw(input.id);
      if (!result) throw new TRPCError({ code: 'BAD_REQUEST', message: 'El concurso no está activo o ya se sorteó.' });
      await db.recordAdminAudit({ action: 'contest.draw', targetType: 'contest', targetId: input.id, payload: result, ip: clientIp(ctx) });
      return result;
    }),
    wheel: adminReadProcedure.input(z.object({ id: z.number().int() })).query(({ input }) => contestSvc.getDrawWheel(input.id)),
    setDisqualified: adminProcedure.input(z.object({ participantId: z.number().int(), disqualified: z.boolean(), reason: z.string().max(200).nullable().optional() })).mutation(async ({ input, ctx }) => {
      await contestSvc.setParticipantDisqualified(input.participantId, input.disqualified, input.reason);
      await db.recordAdminAudit({ action: 'contest.disqualify', targetType: 'contestParticipant', targetId: input.participantId, payload: input, ip: clientIp(ctx) });
      return { success: true };
    }),
    adjustParticipant: adminProcedure.input(z.object({ participantId: z.number().int(), story: z.boolean().optional(), mentionsDelta: z.number().int().min(-50).max(50).optional() })).mutation(async ({ input, ctx }) => {
      try {
        const result = await contestSvc.adjustParticipant(input.participantId, { story: input.story, mentionsDelta: input.mentionsDelta });
        await db.recordAdminAudit({ action: 'contest.adjustParticipant', targetType: 'contestParticipant', targetId: input.participantId, payload: { ...input, ...result }, ip: clientIp(ctx) });
        return result;
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo ajustar.' });
      }
    }),
    photoEntries: adminReadProcedure.input(z.object({ id: z.number().int() })).query(async ({ input }) => (await import('./contestPhoto')).listPhotoEntries(input.id)),
    hidePhotoEntry: adminProcedure.input(z.object({ entryId: z.number().int(), hidden: z.boolean() })).mutation(async ({ input, ctx }) => {
      await (await import('./contestPhoto')).setPhotoHidden(input.entryId, input.hidden);
      await db.recordAdminAudit({ action: 'contest.hidePhoto', targetType: 'contestEntry', targetId: input.entryId, payload: input, ip: clientIp(ctx) });
      return { success: true };
    }),
    pickPhotoWinners: adminProcedure.input(z.object({ id: z.number().int(), entryIds: z.array(z.number().int()).min(1).max(30) })).mutation(async ({ input, ctx }) => {
      try {
        const result = await (await import('./contestPhoto')).pickPhotoWinners(input.id, input.entryIds);
        await db.recordAdminAudit({ action: 'contest.pickPhotoWinners', targetType: 'contest', targetId: input.id, payload: { ...input, ...result }, ip: clientIp(ctx) });
        return result;
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudieron elegir los ganadores.' });
      }
    }),
    holderInviteStatus: adminReadProcedure.input(z.object({ id: z.number().int() })).query(({ input }) => contestSvc.getHolderInviteStatus(input.id)),
    sendHolderInvites: adminProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input, ctx }) => {
      try {
        const result = await contestSvc.sendHolderInvites(input.id);
        await db.recordAdminAudit({ action: 'contest.sendHolderInvites', targetType: 'contest', targetId: input.id, payload: result, ip: clientIp(ctx) });
        return result;
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudieron enviar los correos.' });
      }
    }),
    recalcMentions: adminProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input, ctx }) => {
      try {
        const result = await contestSvc.recalcMentions(input.id);
        await db.recordAdminAudit({ action: 'contest.recalcMentions', targetType: 'contest', targetId: input.id, payload: result, ip: clientIp(ctx) });
        return result;
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo recalcular.' });
      }
    }),
    markHolder: adminProcedure.input(z.object({ participantId: z.number().int(), email: z.string().trim().email().max(320) })).mutation(async ({ input }) => {
      try {
        await contestSvc.markParticipantHolder(input.participantId, input.email);
        return { success: true };
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo marcar.' });
      }
    }),
    markRefundDone: adminProcedure.input(z.object({ winnerId: z.number().int() })).mutation(async ({ input, ctx }) => {
      try {
        await contestSvc.markRefundDone(input.winnerId);
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo marcar.' });
      }
      await db.recordAdminAudit({ action: 'contest.refundDone', targetType: 'contestWinner', targetId: input.winnerId, ip: clientIp(ctx) });
      return { success: true };
    }),
    /* Página pública /concurso/premio/:token: el ganador que ya había
     * comprado elige devolución o una entrada doble para regalar. */
    choice: router({
      get: publicProcedure.input(z.object({ token: z.string().max(64) })).query(({ input }) => contestSvc.getWinnerChoice(input.token)),
      submit: publicProcedure.input(z.object({ token: z.string().max(64), choice: z.enum(['refund', 'gift']) })).mutation(async ({ input, ctx }) => {
        const ipKey = `contest-choice:${clientIp(ctx)}`;
        if (!(await db.checkIpRateLimit(ipKey))) {
          throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Prueba de nuevo en un rato.' });
        }
        await db.recordIpAttempt(ipKey, 30, 30 * 60 * 1000);
        try {
          return await contestSvc.submitWinnerChoice(input.token, input.choice);
        } catch (err) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo guardar tu elección.' });
        }
      }),
    }),
    approveWinner: adminProcedure.input(z.object({ winnerId: z.number().int() })).mutation(async ({ input, ctx }) => {
      try {
        const result = await contestSvc.approveWinner(input.winnerId);
        await db.recordAdminAudit({ action: 'contest.approveWinner', targetType: 'contestWinner', targetId: input.winnerId, payload: result, ip: clientIp(ctx) });
        return result;
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo aprobar.' });
      }
    }),
    rejectWinner: adminProcedure.input(z.object({ winnerId: z.number().int(), note: z.string().max(500).optional() })).mutation(async ({ input, ctx }) => {
      try {
        const result = await contestSvc.rejectWinner(input.winnerId, input.note);
        await db.recordAdminAudit({ action: 'contest.rejectWinner', targetType: 'contestWinner', targetId: input.winnerId, payload: { ...result, note: input.note ?? null }, ip: clientIp(ctx) });
        return result;
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo rechazar.' });
      }
    }),
    checkFollows: adminProcedure.input(z.object({ winnerId: z.number().int() })).mutation(({ input }) => contestSvc.checkWinnerFollows(input.winnerId)),
    skipWinner: adminProcedure.input(z.object({ winnerId: z.number().int() })).mutation(async ({ input, ctx }) => {
      const result = await contestSvc.skipWinner(input.winnerId);
      await db.recordAdminAudit({ action: 'contest.skipWinner', targetType: 'contestWinner', targetId: input.winnerId, payload: result, ip: clientIp(ctx) });
      return result;
    }),
  }),

  /* Baja de correos de promociones desde el link del pie (página pública /baja).
   * El link lleva el correo y una firma: sin firma válida no se da de baja a nadie. */
  /* «Mi cuenta» de los socios (server/members.ts): entrar con un código al
   * correo y ver saldo, Playcoins, entradas y cupones. Opcional: nadie la
   * necesita para comprar. */
  member: router({
    // Liviano: ¿hay sesión en este navegador? (para el menú, el checkout y la preventa de socios).
    session: publicProcedure.query(async ({ ctx }) => {
      const email = getMemberEmail(ctx.req);
      if (!email) return { loggedIn: false as const };
      const c = await members.findCustomer(email);
      return c ? { loggedIn: true as const, email: c.email, fullName: c.fullName, isMember: !!c.memberSince } : { loggedIn: false as const };
    }),
    // Lo que se regala al entrar por primera vez (para que el texto de los avisos no prometa lo que no existe).
    perks: publicProcedure.query(async () => {
      const c = await members.getMemberConfig();
      // `invite`: el sitio siempre invita a «Mi cuenta» (entradas, Playcoins y avisos); `welcome` solo promete el cupón si está prendido.
      return { welcome: c.welcome.enabled ? c.welcome.percent : 0, invite: true };
    }),
    // Manda el código al correo (a cualquiera: quien instala la app sin haber comprado también entra).
    // Si el envío falla se avisa, para que la persona reintente en vez de esperar un correo que no llega.
    requestCode: publicProcedure.input(z.object({ email: z.string().email().max(200) })).mutation(async ({ input, ctx }) => {
      const email = normalizeMemberEmail(input.email);
      const ipKey = `member-send-ip:${clientIp(ctx)}`;
      const emailKey = `member-send:${email}`;
      if (!(await db.checkIpRateLimit(ipKey)) || !(await db.checkIpRateLimit(emailKey))) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Pediste muchos códigos. Espera un rato e intenta de nuevo.' });
      }
      await db.recordIpAttempt(ipKey, 10, 60 * 60 * 1000);
      await db.recordIpAttempt(emailKey, 5, 60 * 60 * 1000);
      if (!(await members.sendMemberCode(email))) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'No pudimos mandar el correo. Revisa que esté bien escrito e intenta de nuevo en un minuto.' });
      }
      return { ok: true as const };
    }),
    // Desde una entrada o un pago: el código va al correo de ESA compra (nunca a uno que escriba quien pide) y se devuelve enmascarado.
    requestCodeForPurchase: publicProcedure.input(z.object({ ticketCode: z.string().max(64).optional(), orderNumber: z.string().max(32).optional() })).mutation(async ({ input, ctx }) => {
      const ipKey = `member-send-ip:${clientIp(ctx)}`;
      if (!(await db.checkIpRateLimit(ipKey))) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Pediste muchos códigos. Espera un rato e intenta de nuevo.' });
      await db.recordIpAttempt(ipKey, 10, 60 * 60 * 1000);
      const email = await members.emailForTicketOrOrder(input);
      if (!email) throw new TRPCError({ code: 'NOT_FOUND', message: 'No encontramos esa compra.' });
      const emailKey = `member-send:${email}`;
      if (!(await db.checkIpRateLimit(emailKey))) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Pediste muchos códigos. Espera un rato e intenta de nuevo.' });
      await db.recordIpAttempt(emailKey, 5, 60 * 60 * 1000);
      if (!(await members.sendMemberCode(email))) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'No pudimos mandar el correo. Intenta de nuevo en un minuto.' });
      }
      return { maskedEmail: members.maskMemberEmail(email) };
    }),
    // Bono por instalar la app: «Mi cuenta» lo llama al abrirse desde la app instalada (`standalone`). Un cupón personal
    // por persona y fiesta, de monto fijo y con vencimiento a la hora que fijó el dueño (Admin → App → Cupones).
    claimAppBonus: publicProcedure.input(z.object({ standalone: z.boolean() })).mutation(async ({ ctx, input }) => {
      const email = getMemberEmail(ctx.req);
      if (!email) return { status: 'no_session' as const };
      if (!input.standalone) return { status: 'not_installed' as const };
      return members.claimAppBonus(email);
    }),
    // Canjea el código por la sesión (cookie de 90 días). Los cupones de bienvenida/nivel/cumpleaños se entregan acá.
    verifyCode: publicProcedure.input(z.object({
      email: z.string().email().max(200).optional(),
      // Si el código se pidió desde una entrada o un pago, el correo se resuelve acá (nunca viaja al navegador).
      ticketCode: z.string().max(64).optional(),
      orderNumber: z.string().max(32).optional(),
      code: z.string().min(1).max(20),
    })).mutation(async ({ input, ctx }) => {
      const email = input.email ? normalizeMemberEmail(input.email) : await members.emailForTicketOrOrder(input);
      if (!email) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Código incorrecto o vencido.' });
      const emailKey = `member-verify:${email}`;
      const ipKey = `member-verify-ip:${clientIp(ctx)}`;
      if (!(await db.checkIpRateLimit(emailKey)) || !(await db.checkIpRateLimit(ipKey))) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Espera unos minutos y pide un código nuevo.' });
      }
      if (!verifyMemberCode(email, input.code)) {
        await db.recordIpAttempt(emailKey, 5, 15 * 60 * 1000);
        await db.recordIpAttempt(ipKey, 20, 15 * 60 * 1000);
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Código incorrecto o vencido.' });
      }
      // Primera vez de alguien que nunca compró: su ficha nace acá, con el correo ya comprobado.
      const customer = (await members.findCustomer(email)) ?? (await members.createSignupCustomer(email));
      if (!customer) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'No pudimos crear tu cuenta. Intenta de nuevo.' });
      // Con un correo que se unió a otra ficha, la sesión queda con el correo de la ficha principal.
      const sessionEmail = normalizeMemberEmail(customer.email);
      setMemberSession(ctx.req, ctx.res, sessionEmail);
      const r = await members.completeLogin(sessionEmail);
      return { ok: true as const, isNew: r.isNew, granted: r.granted.map((g) => ({ title: g.title, percent: g.percent, days: g.days })) };
    }),
    me: publicProcedure.query(async ({ ctx }) => {
      const email = getMemberEmail(ctx.req);
      if (!email) return null;
      const home = await members.getMemberHome(email);
      // Sesión abierta con un correo que se unió a otra ficha: la cookie pasa al correo de la ficha principal.
      if (home) {
        const main = (await members.findCustomer(email))?.email;
        if (main && normalizeMemberEmail(main) !== email) setMemberSession(ctx.req, ctx.res, normalizeMemberEmail(main));
      }
      // `isAdmin`: el correo es del dueño (ADMIN_EMAILS) → la app muestra el acceso al panel.
      return home ? { ...home, isAdmin: isAdminEmail(email) } : home;
    }),
    // «Mis movimientos»: todo lo que hizo y gastó (compras, saldo, Playcoins, canjes, guardarropía y cocina), por
    // página y con filtro. Solo lo del correo de la sesión (server/memberHistory.ts).
    history: publicProcedure.input(z.object({
      filter: z.enum(['todo', 'compras', 'saldo', 'playcoins', 'canjes']).default('todo'),
      cursor: z.string().max(120).nullish(),
      limit: z.number().int().min(5).max(60).optional(),
    })).query(async ({ ctx, input }) => {
      const email = getMemberEmail(ctx.req);
      if (!email) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Entra a tu cuenta para ver tus movimientos.' });
      return getMemberHistory(email, { filter: input.filter, cursor: input.cursor ?? null, limit: input.limit });
    }),
    // Tarjeta de sellos de la app: 1 de regalo + 1 por fiesta a la que entró; 6 = un Acceso Dúo gratis.
    stamps: publicProcedure.query(async ({ ctx }) => {
      const email = getMemberEmail(ctx.req);
      return email ? getStampCard(email) : null;
    }),
    // Si el correo de la sesión es de un embajador activo: su panel (ventas,
    // comisión y el contenido aprobado para compartir), el mismo de
    // /embajador/<CODIGO>. null para todos los demás.
    ambassador: publicProcedure.query(async ({ ctx }) => {
      const email = getMemberEmail(ctx.req);
      if (!email) return null;
      const ambassador = await ambassadorProgram.findAmbassadorByEmail(email);
      return ambassador ? ambassadorProgram.getAmbassadorPanel(ambassador.code) : null;
    }),
    // Para llenar «Tus datos» del checkout (solo con sesión de «Mi cuenta»; los datos son del mismo socio).
    checkoutPrefill: publicProcedure.query(async ({ ctx }) => {
      const email = getMemberEmail(ctx.req);
      if (!email) return null;
      const c = await members.findCustomer(email);
      if (!c) return null;
      return { fullName: c.fullName || null, email: c.email, phone: c.phone || null, rut: c.rut || null, instagram: c.instagram || null, docType: (c.rut && !isValidRut(c.rut) ? 'passport' : 'rut') as 'rut' | 'passport' };
    }),
    // Si el correo de la sesión es de alguien del staff (Finanzas → Equipo): su credencial, turnos e info.
    staff: publicProcedure.query(async ({ ctx }) => {
      const email = getMemberEmail(ctx.req);
      return email ? staffPortal.getStaffPortal(email) : null;
    }),
    // Aprobación de soltero de esta cuenta (para comprar Soltero / Dúo de dos hombres sin código).
    soltero: publicProcedure.query(async ({ ctx }) => {
      const email = getMemberEmail(ctx.req);
      if (!email) return null;
      const row = await solteros.getSolteroApproval(email);
      return row ? { status: row.status, requestedAt: row.requestedAt, reviewedAt: row.reviewedAt } : null;
    }),
    solteroRequest: publicProcedure.input(z.object({
      fullName: z.string().max(255),
      rut: z.string().max(20),
      instagram: z.string().max(100),
      phone: z.string().max(40),
      referredBy: z.string().max(160).nullish(),
      message: z.string().max(500).nullish(),
    })).mutation(async ({ ctx, input }) => {
      const email = getMemberEmail(ctx.req);
      if (!email) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Entra a tu cuenta primero.' });
      const ipKey = `soltero-request:${clientIp(ctx)}`;
      if (!(await db.checkIpRateLimit(ipKey))) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Espera un rato.' });
      await db.recordIpAttempt(ipKey, 10, 60 * 60 * 1000);
      try { return await solteros.requestSolteroApproval(email, input); }
      catch (e: any) { throw new TRPCError({ code: 'BAD_REQUEST', message: e?.message ?? 'No se pudo enviar la solicitud' }); }
    }),
    // Manual del staff de quien entra (reglamento general + el de su cargo) y su «Leí y acepto».
    staffManual: publicProcedure.query(async ({ ctx }) => {
      const email = getMemberEmail(ctx.req);
      if (!email) return null;
      const staff = await staffPortal.findStaffByEmail(email);
      if (!staff || !(await manualSchemaStatus()).ready) return null;
      return staffManualSvc.manualForStaff(staff);
    }),
    // «Llegué» desde la app del staff y del administrador (server/staffEntry.ts): la entrada oficial «Staff» queda usada,
    // se cuenta en la fiesta, se abre Playmatch y, si vino en auto, se le da el estacionamiento sin cobro.
    staffArrival: publicProcedure.query(async ({ ctx }) => {
      const email = getMemberEmail(ctx.req);
      if (!email) return null;
      await staffPortal.ensureAdminStaffAccess(email);
      return staffEntrySvc.staffArrivalState(email);
    }),
    staffCheckIn: publicProcedure.input(z.object({ enAuto: z.boolean() })).mutation(async ({ input, ctx }) => {
      const email = getMemberEmail(ctx.req);
      if (!email) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Entra a tu cuenta primero.' });
      await staffPortal.ensureAdminStaffAccess(email);
      try { return await staffEntrySvc.staffCheckIn(email, input.enAuto); }
      catch (e) { throw new TRPCError({ code: 'BAD_REQUEST', message: e instanceof Error ? e.message : 'No se pudo marcar la llegada.' }); }
    }),
    staffUndoCheckIn: publicProcedure.mutation(async ({ ctx }) => {
      const email = getMemberEmail(ctx.req);
      if (!email) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Entra a tu cuenta primero.' });
      try { return await staffEntrySvc.staffUndoCheckIn(email); }
      catch (e) { throw new TRPCError({ code: 'BAD_REQUEST', message: e instanceof Error ? e.message : 'No se pudo deshacer.' }); }
    }),
    // Dosier de barra para la app del staff (y del administrador): las fichas de preparación del evento de su turno,
    // solo para quien trabaja en barra/caja o coordina. Sin precios ni costos.
    staffDosier: publicProcedure.query(async ({ ctx }) => {
      const email = getMemberEmail(ctx.req);
      if (!email) return null;
      await staffPortal.ensureAdminStaffAccess(email);
      const staff = await staffPortal.findStaffByEmail(email);
      if (!staff || !puedeVerDosier(staff.cargo, staff.role)) return null;
      const eventId = await staffPortal.staffDosierEventId(staff.id);
      if (!eventId) return null;
      const data = await dosierFichas(eventId).catch(() => null);
      if (!data) return null;
      return { eventId, data, pdfPath: dosierPath(firmarDosier(eventId, 24 * 3600 * 1000).token) };
    }),
    // Los anfitriones de Playmatch (cargo «Anfitrión Playmatch», y el dueño para probarlo): cómo va la noche y a quién ayudar.
    playmatchHost: publicProcedure.query(async ({ ctx }) => {
      const email = getMemberEmail(ctx.req);
      const access = email ? await playmatchHostAccess(email) : null;
      if (!access) return null;
      const cfg = await db.getPartyConfig(access.eventId);
      const overview = await playmatch.hostOverview(access.eventId, cfg);
      return overview ? { eventId: access.eventId, eventTitle: access.eventTitle, hostName: access.staff.name, playmatchOn: cfg.enabled, ...overview } : null;
    }),
    // La pauta del animador (cargo «Animador / MC», y el dueño para probarla): dinámicas, guion de la noche, señales y checklist.
    animadorPauta: publicProcedure.query(async ({ ctx }) => {
      const email = getMemberEmail(ctx.req);
      const access = email ? await animadorAccess(email) : null;
      if (!access) return null;
      return { animadorName: access.staff.name, ...pautaAnimador() };
    }),
    playmatchHostSearch: publicProcedure.input(z.object({ q: z.string().max(60).default('') })).query(async ({ input, ctx }) => {
      const email = getMemberEmail(ctx.req);
      const access = email ? await playmatchHostAccess(email) : null;
      if (!access) throw new TRPCError({ code: 'FORBIDDEN', message: 'Esta pantalla es solo para los anfitriones de Playmatch.' });
      return playmatch.hostSearch(access.eventId, input.q);
    }),
    playmatchHostNudge: publicProcedure.input(z.object({ profileId: z.number(), what: z.enum(['photo', 'tastes']) })).mutation(async ({ input, ctx }) => {
      const email = getMemberEmail(ctx.req);
      const access = email ? await playmatchHostAccess(email) : null;
      if (!access) throw new TRPCError({ code: 'FORBIDDEN', message: 'Esta pantalla es solo para los anfitriones de Playmatch.' });
      const res = await playmatch.hostNudge(access.eventId, input.profileId, input.what);
      if (!res.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: res.reason });
      return res;
    }),
    staffManualAccept: publicProcedure.mutation(async ({ ctx }) => {
      const email = getMemberEmail(ctx.req);
      if (!email) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Entra a tu cuenta primero.' });
      const staff = await staffPortal.findStaffByEmail(email);
      if (!staff) throw new TRPCError({ code: 'FORBIDDEN', message: 'Esta cuenta no es del staff.' });
      if (!(await manualSchemaStatus()).ready) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'El manual todavía no está disponible.' });
      const ua = ctx.req.headers['user-agent'];
      const fwd = ctx.req.headers['x-forwarded-for'];
      const ip = (typeof fwd === 'string' ? fwd.split(',')[0].trim() : fwd?.[0]) || ctx.req.socket.remoteAddress || null;
      try { return await staffManualSvc.acceptManuals(staff, { userAgent: typeof ua === 'string' ? ua : null, ip }); }
      catch (e: any) { throw new TRPCError({ code: 'BAD_REQUEST', message: e?.message ?? 'No se pudo guardar' }); }
    }),
    // La persona del staff crea (o cambia) el PIN con que entra a caja, puerta, cocina y guardarropía.
    staffSetPin: publicProcedure.input(z.object({ pin: z.string().min(4).max(6) })).mutation(async ({ ctx, input }) => {
      const email = getMemberEmail(ctx.req);
      if (!email) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Entra a tu cuenta primero.' });
      try { return await staffPortal.setOwnStaffPin(email, input.pin); }
      catch (e: any) { throw new TRPCError({ code: 'BAD_REQUEST', message: e?.message ?? 'No se pudo guardar el PIN' }); }
    }),
    // Recompra en un toque: su última entrada y sus acompañantes (solo los de sus propias compras).
    repurchase: publicProcedure.query(async ({ ctx }) => {
      const email = getMemberEmail(ctx.req);
      if (!email) return null;
      return members.getRepurchase(email);
    }),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      clearMemberSession(ctx.req, ctx.res);
      return { ok: true as const };
    }),

    // ── Face ID / Touch ID (passkeys): entrar sin el código al correo (server/memberPasskeys.ts) ──
    // Las llaves de la sesión, más la identidad del llavero (para la Signal API; no es un secreto).
    passkeys: publicProcedure.query(async ({ ctx }) => {
      const email = getMemberEmail(ctx.req);
      if (!email) return null;
      const rows = await memberPasskeys.listMemberPasskeys(email);
      return {
        userId: Buffer.from(memberPasskeys.memberPasskeyUserId(email)).toString('base64url'),
        email,
        list: rows.map((r) => ({ id: r.id, credentialId: r.credentialId, deviceLabel: r.deviceLabel, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt })),
      };
    }),
    // Activar: solo con la sesión ya abierta (con el código), así la llave queda ligada a ese correo.
    passkeyRegisterOptions: publicProcedure.mutation(async ({ ctx }) => {
      const email = getMemberEmail(ctx.req);
      if (!email) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Entra a tu cuenta para activar Face ID.' });
      const customer = await members.findCustomer(email);
      const { rpID } = getRpIdAndOrigin(ctx.req);
      return memberPasskeys.registrationOptions({ rpID, email, displayName: customer?.fullName ?? null });
    }),
    passkeyRegisterVerify: publicProcedure.input(z.object({ ticket: z.string().max(2000), response: z.any() })).mutation(async ({ input, ctx }) => {
      const email = getMemberEmail(ctx.req);
      if (!email) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Entra a tu cuenta para activar Face ID.' });
      const { rpID, origin } = getRpIdAndOrigin(ctx.req);
      const ok = await memberPasskeys.verifyAndSaveRegistration({ email, ticket: input.ticket, response: input.response, rpID, origin, userAgent: ctx.req.headers['user-agent'] });
      if (!ok) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No se pudo activar. Intenta de nuevo.' });
      return { ok: true as const };
    }),
    passkeyDelete: publicProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input, ctx }) => {
      const email = getMemberEmail(ctx.req);
      if (!email) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Entra a tu cuenta.' });
      await memberPasskeys.deleteMemberPasskey(email, input.id);
      return { ok: true as const };
    }),
    // Entrar: sin sesión. Las llaves son «discoverable»: el teléfono muestra cuál usar, no hay que escribir el correo.
    passkeyLoginOptions: publicProcedure.mutation(async ({ ctx }) => {
      const { rpID } = getRpIdAndOrigin(ctx.req);
      return memberPasskeys.authenticationOptions(rpID);
    }),
    passkeyLoginVerify: publicProcedure.input(z.object({ ticket: z.string().max(2000), response: z.any() })).mutation(async ({ input, ctx }) => {
      const ipKey = `member-passkey-ip:${clientIp(ctx)}`;
      if (!(await db.checkIpRateLimit(ipKey))) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Espera unos minutos o entra con el código.' });
      const { rpID, origin } = getRpIdAndOrigin(ctx.req);
      const r = await memberPasskeys.verifyPasskeyLogin({ ticket: input.ticket, response: input.response, rpID, origin });
      // Una llave que ya no existe acá no cuenta como intento fallido: el cliente se la hace borrar al llavero.
      if (!r.ok && r.reason === 'unknown') throw new TRPCError({ code: 'UNAUTHORIZED', message: `UNKNOWN_CREDENTIAL:${r.credentialId}` });
      if (!r.ok) {
        await db.recordIpAttempt(ipKey, 20, 15 * 60 * 1000);
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'No pudimos verificar tu Face ID. Intenta de nuevo o entra con el código.' });
      }
      if (!(await members.findCustomer(r.email))) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Esta cuenta ya no existe.' });
      setMemberSession(ctx.req, ctx.res, r.email);
      const done = await members.completeLogin(r.email);
      return { ok: true as const, isNew: done.isNew, granted: done.granted.map((g) => ({ title: g.title, percent: g.percent, days: g.days })) };
    }),

    // ── Pagos desde «Mi cuenta» (Etapa A; cada pieza con su interruptor, apagado por defecto) ──
    payConfig: publicProcedure.query(async () => (await members.getMemberConfig()).payments),
    // QR de «Pagar en caja» (2 min, un solo uso).
    payToken: publicProcedure.mutation(async ({ ctx }) => {
      const email = requireMemberEmail(ctx.req);
      if (!(await members.getMemberConfig()).payments.cajaPay) throw new TRPCError({ code: 'BAD_REQUEST', message: 'El pago con la app todavía no está activado.' });
      const ipKey = `member-paytoken:${email}`;
      if (!(await db.checkIpRateLimit(ipKey))) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Espera un momento y vuelve a intentar.' });
      await db.recordIpAttempt(ipKey, 60, 10 * 60 * 1000);
      void memberPay.purgeOldPayTokens().catch(() => {});
      const t = await memberPay.createPayToken(email);
      return { token: t.token, expiresAt: t.expiresAt };
    }),
    // Para el Payment Brick: tarjetas guardadas del socio (null si no hay sesión o el interruptor está apagado).
    payInit: publicProcedure.query(async ({ ctx }) => {
      const email = getMemberEmail(ctx.req);
      if (!email || !(await members.getMemberConfig()).payments.savedCards) return null;
      const init = await memberCards.brickInit(email).catch(() => null);
      return { canSave: true as const, customerId: init?.customerId ?? null, cardIds: init?.cardIds ?? [] };
    }),
    cards: router({
      list: publicProcedure.query(async ({ ctx }) => {
        const email = getMemberEmail(ctx.req);
        if (!email || !(await members.getMemberConfig()).payments.savedCards) return [];
        return memberCards.listCards(email).catch(() => []);
      }),
      remove: publicProcedure.input(z.object({ cardId: z.string().min(1).max(64) })).mutation(async ({ input, ctx }) => {
        const email = requireMemberEmail(ctx.req);
        try { await memberCards.removeCard(email, input.cardId); } catch (err) { throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo eliminar' }); }
        return { ok: true as const };
      }),
      setDefault: publicProcedure.input(z.object({ cardId: z.string().min(1).max(64) })).mutation(async ({ input, ctx }) => {
        const email = requireMemberEmail(ctx.req);
        try { await memberCards.setDefaultCard(email, input.cardId); } catch (err) { throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo cambiar' }); }
        return { ok: true as const };
      }),
    }),

    // ── Panel (Clientes → Socios) ──
    adminStats: adminReadProcedure.query(() => members.memberStats()),
    config: adminReadProcedure.query(() => members.getMemberConfig()),
    setConfig: adminProcedure.input(z.record(z.string(), z.any())).mutation(async ({ input }) => {
      const config = normalizeMemberConfig(input);
      await db.updateSiteSettings({ memberConfig: config });
      return config;
    }),
    grantCoupon: adminProcedure.input(z.object({ email: z.string().email(), ...couponGiftInput })).mutation(async ({ input }) => {
      const { email, ...gift } = input;
      try {
        const g = await members.grantManualCoupon(email, gift);
        return { code: g.code, title: g.title, days: g.days, notified: g.notified };
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo crear el cupón' });
      }
    }),
    // A cuántos clientes le llegaría un regalo en lote (antes de confirmar).
    adminOverview: adminReadProcedure.query(() => members.appOverview()),
    previewCouponAudience: adminProcedure.input(couponAudienceInput).query(async ({ input }) => {
      const r = await members.resolveCouponAudience(input);
      return { count: r.customers.length, notCustomers: r.notCustomers, overLimit: r.overLimit, sample: r.customers.slice(0, 5).map((c) => c.fullName || c.email) };
    }),
    grantCouponBatch: adminProcedure.input(z.object({ audience: couponAudienceInput, batchId: z.string().min(6).max(40), ...couponGiftInput })).mutation(async ({ input }) => {
      const { audience, batchId, ...gift } = input;
      try {
        return await members.grantCouponBatch(audience, gift, batchId);
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudieron crear los cupones' });
      }
    }),
    revokeCoupon: adminProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input }) => {
      await members.revokeMemberCoupon(input.id);
      return { ok: true as const };
    }),
  }),

  unsubscribe: router({
    confirm: publicProcedure.input(z.object({ e: z.string().max(500), t: z.string().max(64), push: z.boolean().optional() })).mutation(async ({ input, ctx }) => {
      const ipKey = `unsubscribe:${clientIp(ctx)}`;
      if (!(await db.checkIpRateLimit(ipKey))) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Prueba de nuevo en un rato.' });
      await db.recordIpAttempt(ipKey, 30, 30 * 60 * 1000);
      const email = decodeUnsubscribeEmail(input.e);
      if (!verifyUnsubscribe(email, input.t)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Este link de baja no es válido o está incompleto.' });
      await applyEmailOptOut(email);
      // Interruptor "Notificaciones" de /baja: también apaga los avisos push de ese correo.
      if (input.push) await customerPush.setPushOptOutForEmail(email, true);
      return { success: true, email };
    }),
    pushStatus: publicProcedure.input(z.object({ e: z.string().max(500), t: z.string().max(64) })).query(async ({ input }) => {
      const email = decodeUnsubscribeEmail(input.e);
      if (!verifyUnsubscribe(email, input.t)) return { active: 0 };
      return { active: (await customerPush.countPushForEmail(email)).active };
    }),
  }),

  /* Avisos push a CLIENTES del sitio (server/customerPush.ts). Lo público lo
   * usa el aviso "Activar avisos" del sitio (PushPrompt) y el service worker
   * (sw-site.js); lo del admin, la pestaña Push del panel. */
  customerPush: router({
    publicKey: publicProcedure.query(() => ({ publicKey: customerPush.customerPushPublicKey() })),
    subscribe: publicProcedure.input(z.object({
      subscription: pushSubscriptionSchema,
      ticketCode: z.string().max(64).optional(),
      orderNumber: z.string().max(32).optional(),
      source: z.enum(['ticket', 'pago', 'home', 'concurso', 'puntos', 'app']),
      platform: z.enum(['ios', 'android', 'desktop']),
      standalone: z.boolean(),
    })).mutation(async ({ input, ctx }) => {
      const ipKey = `customer-push:${clientIp(ctx)}`;
      if (!(await db.checkIpRateLimit(ipKey))) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Prueba de nuevo en un rato.' });
      // Generoso: en la fiesta mucha gente sale por la misma IP (WiFi del local).
      await db.recordIpAttempt(ipKey, 200, 30 * 60 * 1000);
      return customerPush.subscribeCustomer(input);
    }),
    link: publicProcedure.input(z.object({ endpoint: z.string().url().max(512), ticketCode: z.string().max(64) })).mutation(async ({ input }) => {
      return customerPush.linkCustomerSubscription(input.endpoint, input.ticketCode);
    }),
    unsubscribe: publicProcedure.input(z.object({ endpoint: z.string().url().max(512) })).mutation(async ({ input }) => {
      await customerPush.unsubscribeCustomer(input.endpoint);
      return { success: true };
    }),
    resubscribe: publicProcedure.input(z.object({ oldEndpoint: z.string().url().max(512), subscription: pushSubscriptionSchema })).mutation(async ({ input }) => {
      await customerPush.resubscribeCustomer(input.oldEndpoint, input.subscription);
      return { success: true };
    }),
    click: publicProcedure.input(z.object({ campaignId: z.number().int().positive(), subscriptionId: z.number().int().positive().optional() })).mutation(async ({ input }) => {
      await customerPush.recordPushClick(input.campaignId, input.subscriptionId);
      return { success: true };
    }),
    // El sitio se abrió como app instalada (una vez por apertura): "¿quién tiene la app?".
    appOpen: publicProcedure.input(z.object({
      deviceId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
      platform: z.enum(['ios', 'android', 'desktop']),
      ticketCode: z.string().max(64).optional(),
      // Dispositivo con avisos activos: suma la hora de apertura a su historial (mejor hora por persona).
      endpoint: z.string().url().max(512).optional(),
    })).mutation(async ({ input, ctx }) => {
      await appDevices.recordAppOpen({ ...input, memberEmail: getMemberEmail(ctx.req) });
      return { success: true };
    }),
    appStats: adminReadProcedure.query(() => appDevices.appInstallStats()),

    // ── Panel ──
    stats: adminReadProcedure.query(() => customerPush.audienceStats()),
    campaigns: adminReadProcedure.query(() => customerPush.listPushCampaigns(80)),
    preview: adminReadProcedure.input(z.object({ segment: pushSegmentSchema })).query(({ input }) => customerPush.previewSegment(input.segment)),
    save: adminProcedure.input(pushCampaignSchema.extend({ id: z.number().optional() })).mutation(async ({ input, ctx }) => {
      const data = { ...input, scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null, createdBy: ctx.user?.name ?? ctx.user?.email ?? null };
      try {
        if (input.id) {
          await customerPush.updatePushCampaign(input.id, data);
          return { id: input.id };
        }
        return { id: await customerPush.createPushCampaign(data) };
      } catch (err) {
        console.error('[CustomerPush] No se pudo guardar la campaña:', err);
        throw new TRPCError({ code: 'BAD_REQUEST', message: customerPush.dbErrorMessage(err) });
      }
    }),
    send: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      try {
        return await customerPush.sendPushCampaign(input.id);
      } catch (err) {
        console.error('[CustomerPush] No se pudo enviar la campaña:', err);
        throw new TRPCError({ code: 'BAD_REQUEST', message: customerPush.dbErrorMessage(err) });
      }
    }),
    cancel: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await customerPush.cancelPushCampaign(input.id);
      return { success: true };
    }),
    sendTest: adminProcedure.input(pushCampaignSchema.pick({ title: true, body: true, url: true, imageUrl: true }).extend({ email: z.string().email() })).mutation(async ({ input }) => {
      try {
        return await customerPush.sendPushTest(input.email, { title: input.title, body: input.body, url: input.url, image: input.imageUrl });
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo enviar' });
      }
    }),
    // Push a una persona (ficha del cliente / Clientes con la app): queda en el Historial.
    devicesFor: adminReadProcedure.input(z.object({ email: z.string().email() })).query(({ input }) => customerPush.countPushForEmail(input.email)),
    sendToCustomer: adminProcedure.input(pushCampaignSchema.pick({ title: true, body: true, url: true }).extend({ email: z.string().email() })).mutation(async ({ input, ctx }) => {
      try {
        return await customerPush.sendPushToCustomer({ ...input, createdBy: ctx.user?.name ?? ctx.user?.email ?? null });
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo enviar' });
      }
    }),
    presets: adminReadProcedure.input(z.object({ kind: z.enum(['template', 'audience']) })).query(({ input }) => customerPush.listPresets(input.kind)),
    savePreset: adminProcedure.input(z.object({ kind: z.enum(['template', 'audience']), name: z.string().trim().min(1).max(80), data: z.any() })).mutation(async ({ input }) => {
      return { id: await customerPush.savePreset(input.kind, input.name, input.data) };
    }),
    deletePreset: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await customerPush.deletePreset(input.id);
      return { success: true };
    }),
    aiDraft: adminProcedure.input(z.object({ idea: z.string().trim().min(3).max(400), eventId: z.number().optional(), audience: z.string().max(300).optional() })).mutation(async ({ input }) => {
      const ev = input.eventId ? await db.getEventById(input.eventId) : null;
      try {
        return { drafts: await draftPushCopy({ idea: input.idea, eventTitle: ev?.title ?? null, audience: input.audience ?? null }) };
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo redactar' });
      }
    }),
    config: adminReadProcedure.query(() => customerPush.getCustomerPushConfig()),
    setConfig: adminProcedure.input(z.record(z.string(), z.any())).mutation(async ({ input }) => {
      const config = normalizeCustomerPushConfig(input);
      await db.updateSiteSettings({ customerPushConfig: config });
      return config;
    }),
  }),

  leads: router({
    // Público: se llama desde LeadCaptureInline en Home.tsx, sin login.
    create: publicProcedure.input(z.object({
      email: z.string().email(),
      phone: z.string().optional(),
      instagram: z.string().optional(),
      eventId: z.number().optional(),
      source: z.string().optional(),
      utmSource: z.string().optional(),
      utmMedium: z.string().optional(),
      utmCampaign: z.string().optional(),
    })).mutation(async ({ input }) => {
      return db.createLead(input);
    }),
    // Admin
    listAll: adminReadProcedure.query(async () => {
      return db.getAllLeads();
    }),
    delete: adminPasswordProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const result = await db.deleteLead(input.id);
      await db.recordAdminAudit({ action: 'leads.delete', targetType: 'lead', targetId: input.id, ip: clientIp(ctx) });
      return result;
    }),
    // Convierte los leads sin convertir en audiencia de mailing (ver
    // db.syncLeadsAsMailingAudience) -- devuelve filas de `customers` para
    // que el selector de audiencia del admin no necesite ningún cambio.
    syncAsAudience: adminProcedure.input(z.object({ eventId: z.number().optional() }).optional()).mutation(async ({ input }) => {
      return db.syncLeadsAsMailingAudience({ eventId: input?.eventId });
    }),
  }),

  // Gastos de la productora (módulo /gastos). El neto, el IVA y el mes
  // contable NO se reciben del cliente: los calcula el servidor en
  // buildExpenseValues, para que no se pueda inventar crédito fiscal desde el
  // navegador.
  // Oráculo de Disfraces (/disfraces) -- el primer endpoint PÚBLICO que
  // llama a la IA, así que va con dos frenos: por IP (una persona curiosa
  // no puede quemar la cuota) y un tope global por día (un bot rotando IPs
  // tampoco). Si la IA falla, server/costumeOracle.ts cae solo a un
  // catálogo estático: nunca devuelve error por culpa del modelo.
  costumeOracle: router({
    generate: publicProcedure.input(z.object({
      vibe: z.enum(ORACLE_VIBES),
      company: z.enum(ORACLE_COMPANY),
      level: z.enum(ORACLE_LEVELS),
      skin: z.enum(ORACLE_SKIN),
      items: z.array(z.enum(ORACLE_ITEMS)).max(ORACLE_ITEMS.length),
      extra: z.string().max(ORACLE_EXTRA_MAX).optional(),
    })).mutation(async ({ input, ctx }) => {
      const ipKey = `costume-oracle:${clientIp(ctx)}`;
      const globalKey = `costume-oracle:global:${new Date().toISOString().slice(0, 10)}`;
      if (!(await db.checkIpRateLimit(ipKey))) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'El oráculo necesita descansar un rato 🔮 Vuelve a consultarlo en una hora.' });
      }
      await db.recordIpAttempt(ipKey, COSTUME_ORACLE_MAX_PER_HOUR, 60 * 60 * 1000);
      // Pasado el tope global del día no se corta la experiencia: se sigue
      // respondiendo, pero con el catálogo estático (costo cero).
      if (!(await db.checkIpRateLimit(globalKey))) return fallbackCostumeResult(input.vibe);
      await db.recordIpAttempt(globalKey, COSTUME_ORACLE_MAX_PER_DAY, 24 * 60 * 60 * 1000);
      return generateCostumeIdeas(input);
    }),
  }),

  expenses: router({
    listAll: adminReadProcedure.input(z.object({
      eventId: z.number().optional(),
      monthKey: z.string().optional(),
      scope: z.enum(['evento', 'general']).optional(),
      category: z.string().optional(),
    }).optional()).query(async ({ input }) => {
      return db.listExpenses(input ?? {});
    }),
    create: adminProcedure.input(expenseInputSchema).mutation(async ({ input, ctx }) => {
      return db.createExpense({ ...input, createdByUserId: ctx.user.id });
    }),
    update: adminPasswordProcedure.input(expenseInputSchema.partial().extend({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { id, adminPassword: _pw, ...data } = input as any;
        const result = await db.updateExpense(id, data);
        await db.recordAdminAudit({ action: 'expenses.update', targetType: 'expense', targetId: id, eventId: (data as any).eventId ?? null, payload: data, ip: clientIp(ctx) });
        return result;
      }),
    delete: adminPasswordProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const result = await db.deleteExpense(input.id);
      await db.recordAdminAudit({ action: 'expenses.delete', targetType: 'expense', targetId: input.id, ip: clientIp(ctx) });
      return result;
    }),
    // Aviso de doble conteo de mercadería (P&L): el dueño decide gasto por
    // gasto si es lo mismo que ya está costeado en la carta. Pide la clave
    // porque cambia el resultado del evento.
    reviewCogs: adminPasswordProcedure.input(z.object({
      id: z.number(), decision: z.enum(['same', 'different', 'reset']),
    })).mutation(async ({ input, ctx }) => {
      const expense = await db.getExpenseById(input.id);
      if (!expense) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ese gasto ya no existe.' });
      const result = await db.setExpenseCogsDecision(input.id, input.decision);
      await db.recordAdminAudit({ action: 'expenses.reviewCogs', targetType: 'expense', targetId: input.id, eventId: expense.eventId ?? null, payload: { decision: input.decision }, ip: clientIp(ctx) });
      return result;
    }),
    // "Deshacer" de la pantalla de éxito del terminal de gastos: borra sin
    // pedir la clave (a diferencia de `delete`) pero SOLO el gasto que esta
    // misma persona acaba de crear, dentro de 2 minutos. Pasado eso, o si lo
    // creó otro, hay que borrarlo con clave desde la lista.
    undoCreate: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const expense = await db.getExpenseById(input.id);
      if (!expense) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ese gasto ya no existe.' });
      const createdAt = new Date(expense.createdAt).getTime();
      const fresh = Date.now() - createdAt <= UNDO_EXPENSE_WINDOW_MS;
      if (expense.createdByUserId !== ctx.user.id || !fresh) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Ya no se puede deshacer: bórralo desde la lista con tu clave.' });
      }
      await db.deleteExpense(input.id);
      await db.recordAdminAudit({ action: 'expenses.undo', targetType: 'expense', targetId: input.id, ip: clientIp(ctx) });
      return { success: true };
    }),
    // Lee una foto de boleta/factura con IA para precargar el formulario de
    // arriba -- nunca guarda nada por sí solo, el admin siempre revisa y
    // aprieta "Guardar gasto" (server/receiptScan.ts).
    scanReceipt: adminProcedure.input(z.object({ imageUrl: z.string().url() })).mutation(async ({ input }) => {
      try {
        return await scanReceiptImage(input.imageUrl);
      } catch (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'No se pudo leer la foto. Completa el formulario a mano.',
          cause: err,
        });
      }
    }),
  }),

  // Simulaciones de presupuesto pre-evento ("¿conviene hacer esta fiesta?")
  // -- pestaña "Presupuesto" dentro de Gastos y P&L. La matemática vive en
  // shared/eventBudget.ts (computeBudgetResult), corrida 100% del lado
  // cliente para que la barra de estado sea instantánea; estos endpoints
  // solo guardan/leen lo que el admin cargó.
  cash: router({
    summary: adminProcedure.input(z.object({ monthKey: z.string().regex(/^\d{4}-\d{2}$/) })).query(({ input }) => cashSvc.getCashSummary(input.monthKey)),
    addWithdrawal: adminProcedure.input(z.object({
      date: z.string(), amount: z.number().int().positive().max(1_000_000_000), account: z.enum(['mercadopago', 'banco', 'efectivo']), note: z.string().max(255).nullish(),
    })).mutation(async ({ input, ctx }) => {
      const r = await cashSvc.addWithdrawal(input);
      await db.recordAdminAudit({ action: 'cash.addWithdrawal', targetType: 'ownerWithdrawal', targetId: r.id, payload: input, ip: clientIp(ctx) });
      return r;
    }),
    deleteWithdrawal: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      await db.recordAdminAudit({ action: 'cash.deleteWithdrawal', targetType: 'ownerWithdrawal', targetId: input.id, ip: clientIp(ctx) });
      return cashSvc.deleteWithdrawal(input.id);
    }),
    setBalance: adminProcedure.input(z.object({ source: z.enum(['mercadopago', 'banco']), balance: z.number().int() })).mutation(({ input }) => cashSvc.setManualBalance(input.source, input.balance)),
    classify: adminProcedure.input(z.object({
      id: z.number().int().positive(),
      classification: z.enum(['venta', 'comision', 'gasto_evento', 'gasto_empresa', 'retiro_dueno', 'traspaso', 'otro', 'por_clasificar']),
      eventId: z.number().int().positive().nullish(), category: z.string().max(40).optional(),
      documentType: z.enum(['boleta', 'factura', 'boleta_honorarios', 'sin_documento']).optional(),
    })).mutation(async ({ input, ctx }) => {
      try { return await cashSvc.classifyMovement({ ...input, userId: ctx.user.id }); }
      catch (e: any) { throw new TRPCError({ code: 'BAD_REQUEST', message: e?.message ?? 'No se pudo clasificar' }); }
    }),
    classifyMany: adminProcedure.input(z.object({
      ids: z.array(z.number().int().positive()).min(1).max(300),
      classification: z.enum(['venta', 'comision', 'gasto_evento', 'gasto_empresa', 'retiro_dueno', 'traspaso', 'otro', 'por_clasificar']),
      eventId: z.number().int().positive().nullish(), category: z.string().max(40).optional(),
      documentType: z.enum(['boleta', 'factura', 'boleta_honorarios', 'sin_documento']).optional(),
    })).mutation(async ({ input, ctx }) => {
      try {
        const r = await cashSvc.classifyMany({ ...input, userId: ctx.user.id });
        await db.recordAdminAudit({ action: 'cash.classifyMany', targetType: 'accountMovements', payload: { count: r.done, classification: input.classification }, ip: clientIp(ctx) });
        return r;
      } catch (e: any) { throw new TRPCError({ code: 'BAD_REQUEST', message: e?.message ?? 'No se pudo clasificar' }); }
    }),
    accountMonth: adminProcedure.input(z.object({ monthKey: z.string().regex(/^\d{4}-\d{2}$/), source: z.enum(['mercadopago', 'banco']).default('mercadopago') }))
      .query(({ input }) => cashSvc.getAccountMonth(input.monthKey, input.source)),
    importStatement: adminProcedure.input(z.object({ text: z.string().min(1).max(3_000_000), preview: z.boolean() })).mutation(async ({ input, ctx }) => {
      const r = await cashSvc.importBankStatement(input.text, input.preview);
      if (!input.preview) await db.recordAdminAudit({ action: 'cash.importStatement', targetType: 'accountMovements', payload: { imported: r.imported }, ip: clientIp(ctx) });
      return { ...r, movements: r.movements.slice(0, 300) };
    }),
    syncMercadoPago: adminProcedure.mutation(async () => mpSync.syncMercadoPago()),
    reconcileMercadoPago: adminProcedure.query(() => mpSync.reconcileMercadoPago()),
  }),

  sii: router({
    month: adminProcedure.input(z.object({ monthKey: z.string().regex(/^\d{4}-\d{2}$/) })).query(({ input }) => siiSvc.getF29Month(input.monthKey)),
    mark: adminProcedure.input(z.object({
      monthKey: z.string().regex(/^\d{4}-\d{2}$/),
      status: z.enum(['pendiente', 'declarado', 'pagado']),
      folio: z.string().max(40).nullish(), amountPaid: z.number().int().min(0).nullish(), notes: z.string().max(1000).nullish(),
    })).mutation(async ({ input, ctx }) => {
      const { monthKey, ...rest } = input;
      const r = await siiSvc.markF29(monthKey, rest);
      await db.recordAdminAudit({ action: `sii.f29.${input.status}`, targetType: 'taxPeriod', payload: input, ip: clientIp(ctx) });
      return r;
    }),
    saveProposal: adminProcedure.input(z.object({ monthKey: z.string().regex(/^\d{4}-\d{2}$/), amount: z.number().int().min(0).nullable() })).mutation(async ({ input, ctx }) => {
      const r = await siiSvc.saveSiiProposal(input.monthKey, input.amount);
      await db.recordAdminAudit({ action: 'sii.saveProposal', targetType: 'taxPeriod', payload: input, ip: clientIp(ctx) });
      return r;
    }),
    learning: adminProcedure.query(() => siiSvc.getSiiLearning()),
    regularization: adminProcedure.query(() => siiSvc.getWebRegularization()),
    saveRegularization: adminProcedure.input(z.object({
      monthKey: z.string().regex(/^\d{4}-\d{2}$/),
      status: z.enum(['pendiente', 'rectificado', 'en_convenio', 'regularizado']),
      folio: z.string().max(40).nullish(), installments: z.number().int().min(1).max(120).nullish(), note: z.string().max(500).nullish(),
    })).mutation(async ({ input, ctx }) => {
      const { monthKey, ...rest } = input;
      const r = await siiSvc.saveRegularization(monthKey, rest);
      await db.recordAdminAudit({ action: 'sii.regularization', targetType: 'taxRegularization', payload: input, ip: clientIp(ctx) });
      return r;
    }),
    honorariosYear: adminProcedure.input(z.object({ year: z.number().int().min(2020).max(2100) })).query(({ input }) => siiSvc.getHonorariosYear(input.year)),
    calendar: adminProcedure.input(z.object({ year: z.number().int().min(2020).max(2100) })).query(({ input }) => siiSvc.getTaxCalendar(input.year)),
    config: adminProcedure.query(() => siiSvc.getSiiConfig()),
    saveConfig: adminProcedure.input(z.object({
      f29DueDay: z.number().int().min(1).max(28).optional(),
      ppmRatePercent: z.number().min(0).max(10).nullable().optional(),
      companyRut: z.string().max(20).nullable().optional(),
      regime: z.string().max(80).nullable().optional(),
      ticketsExempt: z.boolean().optional(),
      webSalesInF29: z.boolean().optional(),
      remindersEnabled: z.boolean().optional(),
      dj1879Date: z.string().optional(), rentaDate: z.string().optional(), patenteDates: z.array(z.string()).max(4).optional(),
    })).mutation(async ({ input, ctx }) => {
      const r = await siiSvc.saveSiiConfig(input as any);
      await db.recordAdminAudit({ action: 'sii.saveConfig', targetType: 'siteSettings', payload: input, ip: clientIp(ctx) });
      return r;
    }),
    ask: adminProcedure.input(z.object({ question: z.string().trim().min(3).max(500), monthKey: z.string().regex(/^\d{4}-\d{2}$/) })).mutation(async ({ input }) => {
      try { return { answer: await siiSvc.askSii(input.question, input.monthKey) }; }
      catch (err) { throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err instanceof Error ? err.message : 'No se pudo generar la respuesta.' }); }
    }),
    eventsToReview: adminProcedure.query(async () => (await db.getAllEvents()).filter((e: any) => e.taxIssuer === 'por_revisar').map((e: any) => ({ id: e.id, title: e.title, eventDate: e.eventDate }))),
    runRemindersNow: adminProcedure.mutation(() => siiSvc.runSiiReminders()),
  }),

  finance: router({
    eventReport: adminProcedure.input(z.object({ eventId: z.number().int().positive() })).query(async ({ input }) => {
      return getEventFinanceReport(input.eventId);
    }),
    live: adminProcedure.input(z.object({ eventId: z.number().int().positive(), windowMinutes: z.number().int().min(10).max(240).default(60) })).query(async ({ input }) => {
      return getEventLive(input.eventId, input.windowMinutes);
    }),
    companyYear: adminProcedure.input(z.object({ year: z.number().int().min(2020).max(2100) })).query(({ input }) => getCompanyYear(input.year)),
    payables: adminProcedure.query(() => getPayables()),
    markCommissionsPaid: adminProcedure.input(z.object({
      ambassadorId: z.number().int().positive(), eventId: z.number().int().positive(), paid: z.boolean(), confirmFuture: z.boolean().optional(),
    })).mutation(async ({ input, ctx }) => {
      try {
        const r = await markCommissionsPaid(input);
        await db.recordAdminAudit({ action: input.paid ? 'finance.commissionsPaid' : 'finance.commissionsUnpaid', targetType: 'ambassador', targetId: input.ambassadorId, eventId: input.eventId, ip: clientIp(ctx) });
        return r;
      } catch (e: any) { throw new TRPCError({ code: 'BAD_REQUEST', message: e?.message ?? 'No se pudo actualizar el pago' }); }
    }),
    resetCommissionPayments: adminProcedure.mutation(async ({ ctx }) => {
      const r = await resetCommissionPayments();
      await db.recordAdminAudit({ action: 'finance.commissionsPaymentsReset', targetType: 'ambassadorCommissions', payload: r, ip: clientIp(ctx) });
      return r;
    }),
    ask: adminProcedure.input(z.object({ question: z.string().trim().min(3).max(500) })).mutation(async ({ input }) => {
      try {
        return { answer: await askFinance(input.question) };
      } catch (err) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err instanceof Error ? err.message : 'No se pudo generar la respuesta.' });
      }
    }),
    // Para probar los correos sin esperar al cron: manda el de la noche más
    // reciente (si hay) o el semanal, sin importar los interruptores.
    sendDigestNow: adminProcedure.input(z.object({ kind: z.enum(['night', 'week']), eventId: z.number().int().positive().optional() })).mutation(async ({ input }) => {
      const mail = input.kind === 'night'
        ? await buildNightSummary(input.eventId ?? (await db.getFeaturedEvent())?.id ?? 0)
        : await buildWeeklySummary(new Date());
      if (!mail) return { sent: false, reason: 'No hay datos para armar el resumen' };
      const r = await sendEmail({ to: ADMIN_NOTIFICATION_EMAIL, subject: mail.subject, html: mail.html });
      return { sent: r.success, reason: r.success ? undefined : r.reason };
    }),
    marginTarget: adminProcedure.query(async () => ({ percent: await getMarginTarget() })),
    setMarginTarget: adminProcedure.input(z.object({ percent: z.number().min(1).max(90) })).mutation(async ({ input, ctx }) => {
      const settings = await db.getSiteSettings();
      const cfg = normalizeAdminAlertsConfig((settings as any).adminAlertsConfig);
      await db.updateSiteSettings({ adminAlertsConfig: normalizeAdminAlertsConfig({ ...cfg, financeMarginTargetPercent: input.percent }) });
      await db.recordAdminAudit({ action: 'finance.setMarginTarget', targetType: 'siteSettings', payload: { percent: input.percent }, ip: clientIp(ctx) });
      return { percent: normalizeAdminAlertsConfig({ financeMarginTargetPercent: input.percent }).financeMarginTargetPercent };
    }),
    // ¿La base ya tiene las columnas del staff unificado? Si no, el panel muestra el botón para actualizarla.
    staffSchema: adminProcedure.query(() => staffSchemaStatus()),
    staffSchemaApply: adminPasswordProcedure.mutation(async ({ ctx }) => {
      try {
        const r = await applyStaffSchema();
        await db.recordAdminAudit({ action: 'system.staffSchemaApply', targetType: 'schema', payload: r, ip: clientIp(ctx) });
        return { ...r, ...(await staffSchemaStatus()) };
      } catch (e: any) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `No se pudo actualizar la base: ${e?.message ?? 'error desconocido'}` });
      }
    }),
    // Manual del staff (reglamento general + uno por cargo, con versiones). Sin las tablas (migración 0131) el editor avisa y ofrece crearlas.
    manualSchema: adminProcedure.query(() => manualSchemaStatus()),
    manualSchemaApply: adminPasswordProcedure.mutation(async ({ ctx }) => {
      try {
        const r = await applyManualSchema();
        await db.recordAdminAudit({ action: 'system.manualSchemaApply', targetType: 'schema', payload: r, ip: clientIp(ctx) });
        return { ...r, ...(await manualSchemaStatus()) };
      } catch (e: any) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `No se pudo actualizar la base: ${e?.message ?? 'error desconocido'}` });
      }
    }),
    manualsCurrent: adminProcedure.query(async () => ((await manualSchemaStatus()).ready ? staffManualSvc.currentManuals() : [])),
    manualsHistory: adminProcedure.input(z.object({ key: z.string() })).query(async ({ input }) => {
      if (!isManualKey(input.key) || !(await manualSchemaStatus()).ready) return [];
      return staffManualSvc.manualHistory(input.key);
    }),
    manualsPublish: adminProcedure.input(z.object({
      key: z.string(), title: z.string().min(1).max(MANUAL_LIMITS.docTitle), sections: z.array(z.any()).max(MANUAL_LIMITS.sections), changeNote: z.string().max(MANUAL_LIMITS.changeNote).nullish(),
    })).mutation(async ({ input, ctx }) => {
      if (!isManualKey(input.key)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Manual desconocido' });
      if (!(await manualSchemaStatus()).ready) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Primero actualiza la base de datos (aviso del editor).' });
      try {
        const r = await staffManualSvc.publishManual({ key: input.key, title: input.title, sections: input.sections, changeNote: input.changeNote });
        await db.recordAdminAudit({ action: 'finance.manualPublish', targetType: 'staffManual', targetId: `${input.key}@${r.version}`, ip: clientIp(ctx) });
        return r;
      } catch (e: any) { throw new TRPCError({ code: 'BAD_REQUEST', message: e?.message ?? 'No se pudo publicar' }); }
    }),
    manualsOverview: adminProcedure.query(async () => ((await manualSchemaStatus()).ready ? staffManualSvc.acceptanceOverview() : [])),
    manualAcceptanceLog: adminProcedure.input(z.object({ staffId: z.number().int().positive() })).query(async ({ input }) => ((await manualSchemaStatus()).ready ? staffManualSvc.acceptanceLog(input.staffId) : [])),
    staffList: adminProcedure.query(async () => {
      // Sin las columnas nuevas todavía no hay nada que listar (el panel avisa y ofrece actualizarla).
      if (!(await staffSchemaStatus()).ready) return [];
      // Ficha única: completa cargo, correo y enlaces de operadores de antes (idempotente, server/staff.ts).
      await staffSvc.backfillStaffUnify(await staffPortal.getLegacyStaffEmails()).catch((e) => console.warn('[staff] backfill', e));
      const list = await staffSvc.listStaff();
      // DJ y RRPP que ya estaban cargados: se les crea su link la primera vez que se abre la lista.
      for (const m of list) if (m.active && m.email && hasSalesLink(m.cargo)) await ensureStaffSalesLink(m.id).catch((e) => console.warn('[staff] link de ventas', e));
      const amb = await ambassadorProgram.listAmbassadorsWithLink();
      return list.map((m) => ({ ...m, sales: hasSalesLink(m.cargo) && m.email ? amb.get(m.email.trim().toLowerCase()) ?? null : null }));
    }),
    staffSave: adminProcedure.input(z.object({
      id: z.number().int().positive().optional(),
      name: z.string().min(1).max(120),
      role: z.string().max(80).nullish(),
      cargo: z.enum(STAFF_CARGO_KEYS).nullish(),
      defaultRateClp: z.number().int().min(0).max(100_000_000).optional(),
      phone: z.string().max(40).nullish(),
      rut: z.string().max(20).nullish(),
      notes: z.string().max(2000).nullish(),
      active: z.boolean().optional(),
      email: z.string().max(200).nullish(),
    })).mutation(async ({ input, ctx }) => {
      const { id, email, ...rest } = input;
      const r = await staffSvc.saveStaff(rest, id);
      let newEmail: string | null = null;
      if (email !== undefined) {
        try { newEmail = await staffPortal.setStaffEmail(r.id, email); }
        catch (e: any) { throw new TRPCError({ code: 'BAD_REQUEST', message: e?.message ?? 'No se pudo guardar el correo' }); }
      }
      // Cargo, nombre o archivado cambian sus accesos de las noches que vienen.
      await staffSvc.syncStaffAccess(r.id).catch((e) => console.warn('[staff] sync', e));
      // DJ y RRPP con correo: su link de ventas (embajador de seguimiento, sin comisión).
      await ensureStaffSalesLink(r.id).catch((e) => console.warn('[staff] link de ventas', e));
      await db.recordAdminAudit({ action: id ? 'finance.staffUpdate' : 'finance.staffCreate', targetType: 'staffMember', targetId: r.id, ip: clientIp(ctx) });
      // Correo nuevo: le llega la bienvenida con el botón a su app (si falla el envío, igual queda guardado).
      const invited = newEmail ? await staffPortal.sendStaffWelcome(r.id).catch(() => false) : false;
      return { ...r, invited };
    }),
    staffInvite: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const sent = await staffPortal.sendStaffWelcome(input.id).catch(() => false);
      if (!sent) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No se pudo mandar: revisa que tenga correo y esté activa.' });
      return { success: true };
    }),
    // Olvidó su PIN: se borra (sus accesos dejan de abrir) y le llega el correo para crear uno nuevo en su app.
    staffResetPin: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      await staffSvc.setStaffPinHash(input.id, null);
      await db.recordAdminAudit({ action: 'finance.staffResetPin', targetType: 'staffMember', targetId: input.id, ip: clientIp(ctx) });
      const sent = await staffPortal.sendStaffWelcome(input.id).catch(() => false);
      return { success: true, sent };
    }),
    // Operadores creados a mano que no calzaron con nadie del staff (por correo o nombre): se enlazan acá.
    staffUnlinkedOperators: adminProcedure.input(z.object({ eventIds: z.array(z.number().int().positive()).max(20) })).query(({ input }) => staffSvc.unlinkedOperators(input.eventIds)),
    staffLinkOperator: adminProcedure.input(z.object({ operatorId: z.number().int().positive(), staffId: z.number().int().positive().nullable() })).mutation(async ({ input, ctx }) => {
      try {
        const r = await staffSvc.linkOperator(input.operatorId, input.staffId);
        await db.recordAdminAudit({ action: 'finance.staffLinkOperator', targetType: 'operator', targetId: input.operatorId, payload: { staffId: input.staffId }, ip: clientIp(ctx) });
        return r;
      } catch (e: any) { throw new TRPCError({ code: 'BAD_REQUEST', message: e?.message ?? 'No se pudo enlazar' }); }
    }),
    staffDelete: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const r = await staffSvc.deleteStaff(input.id);
      await db.recordAdminAudit({ action: 'finance.staffDelete', targetType: 'staffMember', targetId: input.id, ip: clientIp(ctx) });
      return r;
    }),
    shiftsList: adminProcedure.input(z.object({ eventId: z.number().int().positive() })).query(({ input }) => staffSvc.listShifts(input.eventId)),
    shiftAdd: adminProcedure.input(z.object({
      eventId: z.number().int().positive(), staffId: z.number().int().positive(),
      amountClp: z.number().int().min(0).max(100_000_000), hours: z.number().min(0).max(48).nullish(), note: z.string().max(255).nullish(),
      paymentType: z.enum(['transferencia', 'boleta_honorarios']).optional(), amountMode: z.enum(['liquido', 'bruto']).optional(),
    })).mutation(async ({ input, ctx }) => {
      let r: { id: number };
      try { r = await staffSvc.addShift(input); }
      catch (e: any) { throw new TRPCError({ code: 'BAD_REQUEST', message: e?.message ?? 'No se pudo asignar' }); }
      await db.recordAdminAudit({ action: 'finance.shiftAdd', targetType: 'staffShift', targetId: r.id, eventId: input.eventId, ip: clientIp(ctx) });
      // Asignada a la noche: se le crea (o enciende) el acceso a su pantalla y le llega el aviso.
      const access = await staffSvc.syncStaffAccess(input.staffId).catch((e) => { console.warn('[staff] sync', e); return null; });
      const notified = await staffPortal.notifyStaffShift(input.staffId, input.eventId);
      return { ...r, access, notified };
    }),
    // «Copiar equipo del evento anterior»: mismas personas y montos; a cada una le llega su aviso.
    shiftsPrevious: adminProcedure.input(z.object({ eventId: z.number().int().positive() })).query(({ input }) => staffSvc.previousEventWithShifts(input.eventId)),
    shiftsCopy: adminProcedure.input(z.object({ fromEventId: z.number().int().positive(), toEventId: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      if (input.fromEventId === input.toEventId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Elige otro evento' });
      const { added } = await staffSvc.copyShifts(input.fromEventId, input.toEventId);
      for (const staffId of added) {
        await staffSvc.syncStaffAccess(staffId).catch((e) => console.warn('[staff] sync', e));
        await staffPortal.notifyStaffShift(staffId, input.toEventId);
      }
      await db.recordAdminAudit({ action: 'finance.shiftsCopy', targetType: 'event', targetId: input.toEventId, eventId: input.toEventId, payload: { fromEventId: input.fromEventId, added: added.length }, ip: clientIp(ctx) });
      return { added: added.length };
    }),
    shiftUpdate: adminProcedure.input(z.object({
      id: z.number().int().positive(), amountClp: z.number().int().min(0).max(100_000_000).optional(),
      hours: z.number().min(0).max(48).nullish(), note: z.string().max(255).nullish(), paid: z.boolean().optional(),
      paymentType: z.enum(['transferencia', 'boleta_honorarios']).optional(), amountMode: z.enum(['liquido', 'bruto']).optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, ...rest } = input;
      await staffSvc.updateShift(id, rest);
      await db.recordAdminAudit({ action: 'finance.shiftUpdate', targetType: 'staffShift', targetId: id, payload: rest, ip: clientIp(ctx) });
      return { success: true };
    }),
    // App del staff: lo que ve el equipo de un evento (general, vestimenta, contactos, notas por rol) y la hora de citación.
    staffInfo: adminProcedure.input(z.object({ eventId: z.number().int().positive() })).query(({ input }) => staffPortal.getEventStaffInfo(input.eventId)),
    staffInfoSave: adminProcedure.input(z.object({
      eventId: z.number().int().positive(),
      general: z.string().max(3000).optional(),
      dressCode: z.string().max(300).optional(),
      contacts: z.array(z.object({ label: z.string().max(60), phone: z.string().max(30) })).max(6).optional(),
      byRole: z.record(z.string().max(80), z.string().max(1500)).optional(),
    })).mutation(async ({ input, ctx }) => {
      const { eventId, ...patch } = input;
      const r = await staffPortal.saveEventStaffInfo(eventId, patch);
      await db.recordAdminAudit({ action: 'finance.staffInfoSave', targetType: 'event', targetId: eventId, eventId, ip: clientIp(ctx) });
      return r;
    }),
    shiftCallTime: adminProcedure.input(z.object({
      eventId: z.number().int().positive(), staffId: z.number().int().positive(), time: z.string().max(5).nullable(),
    })).mutation(async ({ input }) => {
      try { await staffPortal.setStaffCallTime(input.eventId, input.staffId, input.time || null); }
      catch (e: any) { throw new TRPCError({ code: 'BAD_REQUEST', message: e?.message ?? 'Hora no válida' }); }
      return { success: true };
    }),
    shiftRemove: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      await staffSvc.removeShift(input.id);
      await db.recordAdminAudit({ action: 'finance.shiftRemove', targetType: 'staffShift', targetId: input.id, ip: clientIp(ctx) });
      return { success: true };
    }),
  }),

  budgetSimulations: router({
    // Envía el informe (PDF) por correo. El admin siempre recibe copia. La versión
    // "externa" no muestra costos ni márgenes, ni en el PDF ni en el cuerpo del correo.
    emailReport: adminProcedure.input(z.object({
      ids: z.array(z.number().int().positive()).min(1).max(4),
      version: z.enum(['completa', 'resumen', 'externa']).default('completa'),
      recipients: z.array(z.string().email()).min(1).max(10),
      message: z.string().max(1000).optional(),
    })).mutation(async ({ input }) => {
      const compare = input.ids.length > 1;
      if (compare && input.version === 'externa') throw new TRPCError({ code: 'BAD_REQUEST', message: 'La versión sin márgenes no aplica a una comparación' });
      const sims = await loadBudgetSims(input.ids);
      const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const pdf = compare
        ? await budgetComparisonPdf(sims, input.version === 'resumen' ? 'resumen' : 'completa')
        : await budgetSinglePdf(sims[0], input.version);
      const money = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
      let title: string; let lines: { label: string; value: string }[];
      if (compare) {
        const cmp = compareSimulations(sims.map(({ id, name, input: i }) => ({ id, name, input: i })));
        const w = cmp.sims[cmp.winnerIndex];
        title = `Comparación de ${sims.length} simulaciones`;
        lines = [
          { label: 'Opción recomendada', value: esc(w.name) },
          { label: 'Utilidad estimada', value: money(w.result.pnl.netProfit) },
          { label: 'Margen', value: formatPercent(w.result.pnl.marginPercent) },
        ];
      } else {
        const r = computeBudgetResult(sims[0].input);
        title = `Simulación: ${sims[0].name}`;
        lines = input.version === 'externa'
          ? [{ label: 'Aforo estimado', value: `${r.attendance.toLocaleString('es-CL')} personas` }, { label: 'Ingreso proyectado', value: money(r.grossIncome) }]
          : [{ label: 'Ingreso proyectado', value: money(r.grossIncome) }, { label: 'Utilidad estimada', value: money(r.pnl.netProfit) }, { label: 'Margen', value: formatPercent(r.pnl.marginPercent) }];
      }
      const note = input.message?.trim();
      const html = buildSimpleReportEmail({ title: esc(title), subtitle: note ? esc(note) : 'Informe de simulación de evento', lines });
      const subject = `[Mansion Playroom] ${compare ? 'Comparación de simulaciones' : `Simulación ${sims[0].name}`}`;
      const filename = `${compare ? 'comparacion-simulaciones' : `simulacion-${budgetSlug(sims[0].name)}`}${input.version === 'completa' ? '' : `-${input.version}`}.pdf`;
      const recipients = Array.from(new Set([ADMIN_NOTIFICATION_EMAIL, ...input.recipients.map((e) => e.toLowerCase())]));
      const results = await Promise.all(recipients.map((to) => sendEmail({ to, subject, html, attachments: [{ filename, content: pdf }] })));
      return { success: true, emailSent: results.every((r) => r.success), sentTo: recipients.length };
    }),

    listAll: adminReadProcedure.input(z.object({
      eventId: z.number().optional(),
    }).optional()).query(async ({ input }) => {
      return eventBudget.listSimulations(input?.eventId);
    }),

    get: adminReadProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return eventBudget.getSimulation(input.id);
    }),

    create: adminProcedure.input(budgetSimulationInputSchema).mutation(async ({ input, ctx }) => {
      return eventBudget.createSimulation(input, ctx.user.id);
    }),

    update: adminProcedure.input(budgetSimulationInputSchema.extend({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return eventBudget.updateSimulation(id, data);
      }),

    delete: adminPasswordProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const result = await eventBudget.deleteSimulation(input.id);
      await db.recordAdminAudit({ action: 'budgetSimulations.delete', targetType: 'budgetSimulation', targetId: input.id, ip: clientIp(ctx) });
      return result;
    }),

    /** "Vincular a este evento" -- eventId: null para desvincular. */
    linkToEvent: adminProcedure.input(z.object({
      id: z.number(),
      eventId: z.number().nullable(),
    })).mutation(async ({ input }) => {
      return eventBudget.linkSimulationToEvent(input.id, input.eventId);
    }),
  }),

  // Lista de bloqueo de clientes (por RUT) -- solo admin, nunca expuesta al
  // checkout público (el chequeo en sí vive dentro de orders.create/createOrder).
  blockedCustomers: router({
    listAll: adminReadProcedure.query(async () => {
      return db.getAllBlockedCustomers();
    }),
    create: adminProcedure.input(blockedInputSchema).mutation(async ({ input, ctx }) => {
      try {
        const r = await db.createBlockedCustomer(input);
        await db.recordAdminAudit({ action: 'blockedCustomers.create', targetType: 'blockedCustomer', payload: { name: input.fullName ?? null }, ip: clientIp(ctx) });
        return r;
      } catch (e: any) { throw new TRPCError({ code: 'BAD_REQUEST', message: e?.message ?? 'No se pudo guardar' }); }
    }),
    update: adminProcedure.input(blockedInputSchema.extend({ id: z.number() })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      try { return await db.updateBlockedCustomer(id, data); }
      catch (e: any) { throw new TRPCError({ code: 'BAD_REQUEST', message: e?.message ?? 'No se pudo guardar' }); }
    }),
    /** Aplica las filas ya revisadas de una planilla (ver shared/blockedImport.ts). */
    importApply: adminProcedure.input(z.object({
      rows: z.array(z.object({
        fullName: z.string().max(255).nullable(), rut: z.string().max(20).nullable(), email: z.string().max(320).nullable(),
        phone: z.string().max(40).nullable(), instagram: z.string().max(100).nullable(), sourceVenue: z.string().max(120).nullable(),
        sourceProducer: z.string().max(120).nullable(), blockedOn: z.string().max(10).nullable(), reason: z.string().max(500).nullable(), notes: z.string().max(4000).nullable(),
      })).min(1).max(2000),
      sourceBy: z.string().max(120).nullish(),
    })).mutation(async ({ input, ctx }) => {
      const r = await db.importBlockedRows(input.rows, { sourceBy: input.sourceBy ?? null });
      await db.recordAdminAudit({ action: 'blockedCustomers.import', targetType: 'blockedCustomer', payload: r, ip: clientIp(ctx) });
      return r;
    }),
    // Vetos hechos en el momento (por la puerta o por ti): los pendientes de confirmar primero.
    vetoList: adminReadProcedure.query(() => vetoSvc.listVetos()),
    // Vetar a alguien con el código de su entrada (o el QR): titular y acompañantes. Rige confirmado.
    vetoTicket: adminProcedure.input(z.object({
      ticketCode: z.string().min(1).max(40), reasonKey: z.enum(['agresion', 'normas', 'drogas', 'otro']), note: z.string().max(VETO_NOTE_MAX + 20).nullish(),
    })).mutation(async ({ input, ctx }) => {
      try {
        return await vetoSvc.vetoTicket({ ticketCode: input.ticketCode, reasonKey: input.reasonKey, note: input.note, by: { kind: 'admin', name: ctx.user.name || 'Admin' }, ip: clientIp(ctx) });
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo vetar.' });
      }
    }),
    vetoConfirm: adminProcedure.input(z.object({ ticketCode: z.string().min(1).max(40) })).mutation(async ({ input, ctx }) => {
      try { return { people: await vetoSvc.confirmVeto(input.ticketCode, { name: ctx.user.name || 'Admin', ip: clientIp(ctx) }) }; }
      catch (err) { throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo confirmar.' }); }
    }),
    vetoLift: adminProcedure.input(z.object({ ticketCode: z.string().min(1).max(40) })).mutation(async ({ input, ctx }) => {
      try { return await vetoSvc.liftVeto(input.ticketCode, { name: ctx.user.name || 'Admin', ip: clientIp(ctx) }); }
      catch (err) { throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo levantar.' }); }
    }),
    /** Compras y clientes que ya existen y coinciden con la lista (para revisar; no cancela nada). */
    existingMatches: adminReadProcedure.query(() => db.listBlockedExistingMatches()),
    delete: adminPasswordProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const result = await db.deleteBlockedCustomer(input.id);
      await db.recordAdminAudit({ action: 'blockedCustomers.delete', targetType: 'blockedCustomer', targetId: input.id, ip: clientIp(ctx) });
      return result;
    }),
  }),

  referrals: router({
    getStats: adminReadProcedure.query(async () => {
      return db.getReferralStats();
    }),
    // Público, sin login: el mismo código de embajador que llega por email
    // es lo que valida el acceso a las propias estadísticas.
    getByCode: publicProcedure.input(z.object({ code: z.string() })).query(async ({ input }) => {
      return db.getReferralsByCode(input.code);
    }),
    // Público, para el Hall de la Fama -- solo primer nombre + código +
    // cantidad de ventas, nunca montos ni apellido (ver db.getReferralLeaderboard).
    getLeaderboard: publicProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return db.getReferralLeaderboard(input.eventId);
    }),
  }),

  // Embajadores exclusivos con comisión (pedido explícito del usuario) --
  // tab aparte de "Referidos" (arriba), para embajadores dados de alta a
  // mano que cobran una comisión en plata por venta, no descuento.
  ambassadors: router({
    listAll: adminReadProcedure.input(z.object({ eventId: z.number().optional() }).optional()).query(async ({ input }) => {
      const list = await db.listExclusiveAmbassadors(input?.eventId);
      // Link personal de cada embajador (el mismo que ve en su panel y recibe
      // por correo), para copiarlo desde el admin y mandárselo a mano.
      const featured = await db.getFeaturedEvent();
      return list.map((a: any) => ({
        ...a,
        referralUrl: ambassadorProgram.buildAmbassadorReferralUrl(featured, a.code),
      }));
    }),
    create: adminProcedure.input(z.object({
      // Opcional: el código es permanente y de la persona, no del evento.
      eventId: z.number().optional(),
      name: z.string().min(1),
      code: z.string().min(1),
      // `null` = usar la escala global del programa (lo normal).
      commissionPercent: z.number().min(0).max(100).nullable().optional(),
      // % de descuento al comprador sobre el acceso (vacío/0 = sin descuento).
      buyerDiscountPercent: z.number().min(0).max(MAX_AMBASSADOR_BUYER_DISCOUNT).nullable().optional(),
      contact: z.string().optional(),
      email: z.string().email().optional(),
      instagram: z.string().optional(),
    })).mutation(async ({ input }) => {
      return db.createExclusiveAmbassador(input);
    }),
    update: adminProcedure.input(z.object({
      id: z.number(),
      name: z.string().optional(),
      code: z.string().optional(),
      commissionPercent: z.number().min(0).max(100).nullable().optional(),
      buyerDiscountPercent: z.number().min(0).max(MAX_AMBASSADOR_BUYER_DISCOUNT).nullable().optional(),
      contact: z.string().optional(),
      email: z.string().email().optional(),
      instagram: z.string().optional(),
      active: z.number().optional(),
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      return db.updateExclusiveAmbassador(id, data);
    }),
    delete: adminPasswordProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const result = await db.deleteExclusiveAmbassador(input.id);
      await db.recordAdminAudit({ action: 'ambassadors.delete', targetType: 'ambassador', targetId: input.id, ip: clientIp(ctx) });
      return result;
    }),
    // Reporte histórico por evento (el del PR original). Se conserva porque
    // sigue siendo la forma de saber cuánto se pagó en una fiesta puntual.

    // --- Programa VIP automatizado ---


    /** Panel público del embajador (/embajador/<CODIGO>). El código hace de
     * llave -- no hay login de embajadores, mismo criterio que /mis-referidos. */
    getPanelByCode: publicProcedure.input(z.object({ code: z.string() })).query(async ({ input }) => {
      return ambassadorProgram.getAmbassadorPanel(input.code);
    }),

    getConfig: adminReadProcedure.query(async () => {
      return ambassadorProgram.getProgramConfig();
    }),
    updateConfig: adminProcedure.input(z.object({
      launchDate: z.string().optional(),
      commissionScale: z.array(z.object({
        minSales: z.number().int().min(1),
        maxSales: z.number().int().min(1).nullable(),
        percent: z.number().min(0).max(100),
      })).optional(),
      existingClientPercent: z.number().min(0).max(100).optional(),
      benefits: z.array(z.object({
        minSales: z.number().int().min(1),
        items: z.array(z.string()),
        bonusClp: z.number().min(0),
      })).optional(),
      weeklyEmailEnabled: z.boolean().optional(),
      weeklyEmailWeekday: z.number().int().min(0).max(6).optional(),
      weeklyEmailHourChile: z.number().int().min(0).max(23).optional(),
      generalBuyerDiscountEnabled: z.boolean().optional(),
      generalBuyerDiscountPercent: z.number().min(0).max(MAX_AMBASSADOR_BUYER_DISCOUNT).optional(),
      // ISO de cuando se apaga solo; null = sin fecha de término.
      generalBuyerDiscountEndsAt: z.string().nullable().optional(),
    })).mutation(async ({ input }) => {
      const { launchDate, generalBuyerDiscountEndsAt, ...rest } = input;
      return ambassadorProgram.updateProgramConfig({
        ...rest,
        ...(launchDate ? { launchDate: new Date(launchDate) } : {}),
        ...(generalBuyerDiscountEndsAt !== undefined ? { generalBuyerDiscountEndsAt: generalBuyerDiscountEndsAt ? new Date(generalBuyerDiscountEndsAt) : null } : {}),
      });
    }),

    /** Cada evento es su propia campaña: si no viene `eventId`, se usa el evento destacado. */
    getSummary: adminReadProcedure.input(z.object({ eventId: z.number().int().positive().optional() }).optional()).query(async ({ input }) => {
      const eventId = input?.eventId ?? (await db.getFeaturedEvent())?.id;
      return eventId ? ambassadorProgram.getAmbassadorAdminSummary(eventId) : null;
    }),
    getRanking: adminReadProcedure.input(z.object({ eventId: z.number().int().positive().optional() }).optional()).query(async ({ input }) => {
      const eventId = input?.eventId ?? (await db.getFeaturedEvent())?.id;
      return eventId ? ambassadorProgram.getAmbassadorRanking(eventId) : [];
    }),
    getProfile: adminReadProcedure.input(z.object({ id: z.number(), eventId: z.number().int().positive().optional() })).query(async ({ input }) => {
      const eventId = input.eventId ?? (await db.getFeaturedEvent())?.id;
      return {
        stats: eventId ? await ambassadorProgram.getAmbassadorStats(input.id, eventId) : null,
        sales: await ambassadorProgram.getAmbassadorSales(input.id),
      };
    }),
    listReferredClients: adminReadProcedure.query(async () => {
      return ambassadorProgram.listReferredClients();
    }),

    // --- Beneficios entregados ---
    listBenefitDeliveries: adminReadProcedure.input(z.object({ eventId: z.number().int().positive().optional() }).optional()).query(async ({ input }) => {
      const eventId = input?.eventId ?? (await db.getFeaturedEvent())?.id;
      return eventId ? ambassadorProgram.listBenefitDeliveries(eventId) : [];
    }),
    markBenefitDelivered: adminProcedure.input(z.object({
      ambassadorId: z.number(),
      eventId: z.number().int().positive(),
      benefitKey: z.string(),
      note: z.string().optional(),
    })).mutation(async ({ input }) => {
      return ambassadorProgram.markBenefitDelivered(input);
    }),
    unmarkBenefitDelivered: adminProcedure.input(z.object({
      ambassadorId: z.number(),
      eventId: z.number().int().positive(),
      benefitKey: z.string(),
    })).mutation(async ({ input }) => {
      return ambassadorProgram.unmarkBenefitDelivered(input);
    }),

    // --- Material de la semana ---
    getWeeklyMaterial: adminReadProcedure.query(async () => {
      return ambassadorProgram.getWeeklyMaterial();
    }),
    saveWeeklyMaterial: adminProcedure.input(z.object({
      title: z.string().optional(),
      storiesText: z.string().optional(),
      reelText: z.string().optional(),
      postText: z.string().optional(),
      countdownText: z.string().optional(),
      links: z.array(z.object({ label: z.string(), url: z.string() })).optional(),
      driveFolderUrl: z.string().max(500).optional(),
      images: z.array(z.object({ id: z.string(), name: z.string(), mimeType: z.string() })).max(6).optional(),
    })).mutation(async ({ input }) => {
      return ambassadorProgram.saveWeeklyMaterial(input);
    }),
    /** Rellena los 5 campos del material a partir de una idea. NO guarda: el
     * dueño revisa y edita antes de apretar "Guardar", igual que en mailing. */
    generateWeeklyMaterial: adminProcedure.input(z.object({
      idea: z.string().min(5).max(1000),
      // Si viene, la IA también elige qué fotos/videos de esa carpeta usar.
      driveFolderUrl: z.string().max(500).optional(),
    })).mutation(async ({ input }) => {
      try {
        const files = input.driveFolderUrl?.trim() ? await listDriveMedia(input.driveFolderUrl) : [];
        return await ambassadorProgram.generateWeeklyMaterial(input.idea, files);
      } catch (err) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err instanceof Error ? err.message : 'No se pudo generar el material.' });
      }
    }),
    /** Fotos y videos de la carpeta de Drive del material (miniaturas y links
     * de descarga) -- para elegirlos en el admin antes de guardar. */
    listDriveMedia: adminReadProcedure.input(z.object({
      url: z.string().min(1).max(500),
    })).query(async ({ input }) => {
      try {
        return await listDriveMedia(input.url);
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo leer la carpeta de Drive.' });
      }
    }),

    /** Manda el resumen semanal ahora mismo, sin esperar al día configurado --
     * para poder probarlo y para reenviarlo si un lunes falló. */
    sendWeeklyNow: adminProcedure.mutation(async () => {
      return ambassadorProgram.sendWeeklyAmbassadorEmails();
    }),
  }),

  // Postulaciones públicas para ser embajador (página /embajadores).
  ambassadorApplications: router({
    /** Único formulario público del sitio que escribe en la base para que
     * alguien lo revise después, así que es la primera superficie de spam:
     * va con límite por IP y con la validación pura de
     * shared/ambassadorApplication.ts, que el cliente también corre pero en
     * la que no se confía. */
    submit: publicProcedure.input(z.object({
      name: z.string(),
      email: z.string().email('Revisa tu correo'),
      whatsapp: z.string(),
      instagram: z.string(),
      followers: z.string().optional(),
      message: z.string().optional(),
      acceptedTerms: z.boolean(),
    })).mutation(async ({ input, ctx }) => {
      const ipKey = `postulacion:${clientIp(ctx)}`;
      if (!(await db.checkIpRateLimit(ipKey))) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Ya mandaste varias postulaciones. Espera un rato antes de intentar de nuevo.' });
      }
      // Se cuenta antes de guardar: si no, alguien podría gastar intentos
      // fallando la validación y nunca quedar limitado.
      await db.recordIpAttempt(ipKey, APPLICATION_MAX_PER_HOUR, 60 * 60 * 1000);

      if (!input.acceptedTerms) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Tienes que confirmar que cumples los requisitos' });
      }

      const nombre = sanitizeApplicantName(input.name);
      if (!nombre.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: nombre.reason });
      const wsp = sanitizeWhatsapp(input.whatsapp);
      if (!wsp.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: wsp.reason });
      const ig = sanitizeInstagram(input.instagram);
      if (!ig.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: ig.reason });
      if (!input.followers?.trim()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Escribe tu cantidad de seguidores' });
      }
      const seguidores = sanitizeFollowers(input.followers);
      if (!seguidores.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: seguidores.reason });
      const mensaje = sanitizeApplicationMessage(input.message ?? '');
      if (!mensaje.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: mensaje.reason });

      const created = await applications.createApplication({
        name: nombre.value,
        email: input.email,
        whatsapp: wsp.value,
        instagram: ig.value,
        followers: seguidores.value,
        message: mensaje.value,
        acceptedTerms: true,
      });

      if (!created.ok) {
        if (created.reason === 'ya_pendiente') {
          return { ok: true as const, alreadyPending: true as const };
        }
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'No pudimos guardar tu postulación. Intenta de nuevo.' });
      }

      // Los correos van aparte: si Resend falla, la postulación YA quedó
      // guardada y el dueño la ve igual en el panel.
      try {
        await sendEmail({
          to: APPLICATIONS_EMAIL,
          subject: `[Postulaciones] ${nombre.value} — @${ig.value}`,
          html: buildAmbassadorApplicationEmail({
            name: nombre.value,
            email: input.email.trim().toLowerCase(),
            whatsapp: wsp.value,
            instagram: ig.value,
            followers: seguidores.value,
            message: mensaje.value,
            whatsappLink: whatsappLinkFor(wsp.value),
            instagramLink: instagramLinkFor(ig.value),
          }),
        });
        await sendEmail({
          to: input.email.trim().toLowerCase(),
          subject: '👑 Recibimos tu postulación — Mansion Playroom',
          html: buildApplicationReceivedEmail({
            name: nombre.value,
            requirements: [...AMBASSADOR_REQUIREMENTS],
            tasks: [...AMBASSADOR_TASKS],
          }),
        });
      } catch (err) {
        console.error('[Postulaciones] Falló el envío de correos:', err);
      }

      await sendPushToAdmins('pushAmbassadorApplication', {
        title: pushTitle('👑', 'Postulación embajador'),
        body: `${nombre.value} — @${ig.value}`,
        url: '/admin?section=ambassadors',
      });

      return { ok: true as const, alreadyPending: false as const };
    }),

    listAll: adminReadProcedure.input(z.object({
      status: z.enum(['pendiente', 'aprobada', 'rechazada']).optional(),
    }).optional()).query(async ({ input }) => {
      return applications.listApplications(input?.status);
    }),

    countPending: adminReadProcedure.query(async () => {
      return applications.countPendingApplications();
    }),

    review: adminProcedure.input(z.object({
      id: z.number(),
      status: z.enum(['pendiente', 'aprobada', 'rechazada']),
      note: z.string().optional(),
    })).mutation(async ({ input }) => {
      return applications.reviewApplication(input);
    }),

    /** Aprueba y crea al embajador en un solo paso, con el código que escribe
     * el admin, y le manda su código por correo. */
    approve: adminProcedure.input(z.object({
      id: z.number(),
      code: z.string().min(1),
      commissionPercent: z.number().min(0).max(100).nullable().optional(),
    })).mutation(async ({ input }) => {
      const result = await applications.approveApplication(input);

      try {
        await sendEmail({
          to: result.email,
          subject: `🎉 ¡Quedaste! Tu código es ${result.code}`,
          html: buildAmbassadorWelcomeEmail({
            name: result.name,
            code: result.code,
            panelUrl: `${ambassadorProgram.PANEL_BASE_URL}/embajador/${result.code}`,
            tasks: [...AMBASSADOR_TASKS],
          }),
        });
      } catch (err) {
        console.error('[Postulaciones] Falló el correo de bienvenida:', err);
      }

      return result;
    }),
  }),

  // Postulaciones públicas al programa Cumpleañeros (página
  // /beneficios-cumpleaneros) — mismo esqueleto que ambassadorApplications
  // arriba (rate limit por IP + validación pura del lado servidor).
  birthdayApplications: router({
    /** Datos del evento vigente para pintar la ventana de fechas válidas en
     * el formulario, sin que el cliente tenga que adivinar el eventId. */
    eligibility: publicProcedure.query(async () => {
      const event = await db.getFeaturedEvent();
      if (!event) return null;
      return {
        eventId: event.id,
        eventTitle: event.title,
        eventDate: event.eventDate,
        windowDays: BIRTHDAY_WINDOW_DAYS,
        requirements: [...BIRTHDAY_REQUIREMENTS],
        tiers: BIRTHDAY_TIERS,
      };
    }),

    submit: publicProcedure.input(z.object({
      name: z.string(),
      email: z.string().email('Revisa tu correo'),
      whatsapp: z.string(),
      instagram: z.string().optional(),
      birthDate: z.string(),
      message: z.string().optional(),
      acceptedTerms: z.boolean(),
    })).mutation(async ({ input, ctx }) => {
      const ipKey = `postulacion-cumple:${clientIp(ctx)}`;
      if (!(await db.checkIpRateLimit(ipKey))) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Ya mandaste varias postulaciones. Espera un rato antes de intentar de nuevo.' });
      }
      await db.recordIpAttempt(ipKey, APPLICATION_MAX_PER_HOUR, 60 * 60 * 1000);

      if (!input.acceptedTerms) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Tienes que confirmar que aceptas los requisitos' });
      }

      const event = await db.getFeaturedEvent();
      if (!event) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No hay un evento activo para postular ahora mismo' });

      const nombre = sanitizeBirthdayName(input.name);
      if (!nombre.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: nombre.reason });
      const wsp = sanitizeBirthdayWhatsapp(input.whatsapp);
      if (!wsp.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: wsp.reason });
      const ig = sanitizeBirthdayInstagram(input.instagram ?? '');
      if (!ig.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: ig.reason });
      const fecha = sanitizeBirthDate(input.birthDate);
      if (!fecha.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: fecha.reason });
      const mensaje = sanitizeBirthdayMessage(input.message ?? '');
      if (!mensaje.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: mensaje.reason });

      if (!isBirthdayEligible(event.eventDate, fecha.value)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Tu cumpleaños tiene que caer dentro de ${BIRTHDAY_WINDOW_DAYS} días antes o después del evento (${event.title})`,
        });
      }

      const created = await birthdayApplications.createApplication({
        eventId: event.id,
        name: nombre.value,
        email: input.email,
        whatsapp: wsp.value,
        instagram: ig.value,
        birthDate: fecha.value,
        message: mensaje.value,
        acceptedTerms: true,
      });

      if (!created.ok) {
        if (created.reason === 'ya_pendiente') {
          return { ok: true as const, alreadyPending: true as const };
        }
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'No pudimos guardar tu postulación. Intenta de nuevo.' });
      }

      try {
        await sendEmail({
          to: APPLICATIONS_EMAIL,
          subject: `[Cumpleañeros] ${nombre.value} — ${event.title}`,
          html: buildBirthdayApplicationEmail({
            name: nombre.value,
            email: input.email.trim().toLowerCase(),
            whatsapp: wsp.value,
            instagram: ig.value,
            birthDate: fecha.value,
            message: mensaje.value,
            eventTitle: event.title,
            whatsappLink: whatsappLinkFor(wsp.value),
          }),
        });
        await sendEmail({
          to: input.email.trim().toLowerCase(),
          subject: '🎂 Recibimos tu postulación — Mansion Playroom',
          html: buildBirthdayApplicationReceivedEmail({
            name: nombre.value,
            eventTitle: event.title,
            requirements: [...BIRTHDAY_REQUIREMENTS],
          }),
        });
      } catch (err) {
        console.error('[Cumpleañeros] Falló el envío de correos:', err);
      }

      await sendPushToAdmins('pushAmbassadorApplication', {
        title: pushTitle('🎂', 'Postulación cumpleañero'),
        body: `${nombre.value} — ${event.title}`,
        url: '/admin?section=birthdays',
      });

      return { ok: true as const, alreadyPending: false as const };
    }),

    listAll: adminReadProcedure.input(z.object({
      status: z.enum(['pendiente', 'aprobada', 'rechazada']).optional(),
      eventId: z.number().optional(),
    }).optional()).query(async ({ input }) => {
      return birthdayApplications.listApplications(input?.status, input?.eventId);
    }),

    countPending: adminReadProcedure.query(async () => {
      return birthdayApplications.countPendingApplications();
    }),

    review: adminProcedure.input(z.object({
      id: z.number(),
      status: z.enum(['pendiente', 'aprobada', 'rechazada']),
      note: z.string().optional(),
    })).mutation(async ({ input }) => {
      return birthdayApplications.reviewApplication(input);
    }),

    /** Aprueba, crea el código de descuento y liga al cumpleañero en un
     * solo paso, con el % que define el admin. */
    approve: adminProcedure.input(z.object({
      id: z.number(),
      code: z.string().min(1),
      discountPercent: z.number().min(0).max(100),
    })).mutation(async ({ input }) => {
      const result = await birthdayApplications.approveApplication(input);

      try {
        await sendEmail({
          to: result.email,
          subject: `🎉 ¡Listo! Tu código de cumpleañero es ${result.code}`,
          html: buildBirthdayApprovedEmail({
            name: result.name,
            code: result.code,
            discountPercent: input.discountPercent,
            tiers: BIRTHDAY_TIERS,
          }),
        });
      } catch (err) {
        console.error('[Cumpleañeros] Falló el correo de bienvenida:', err);
      }

      return result;
    }),
  }),

  // Panel admin del programa Cumpleañeros: activos por evento, conteo de
  // ventas por código y asignación del crédito de "próximo evento".
  birthdayProgram: router({
    listActiveForEvent: adminReadProcedure.input(z.object({
      eventId: z.number(),
    })).query(async ({ input }) => {
      return birthdayProgram.getBirthdayPeopleForEvent(input.eventId);
    }),

    assignNextEventCredit: adminProcedure.input(z.object({
      birthdayPersonId: z.number(),
      targetEventId: z.number(),
      ticketTypeId: z.number(),
    })).mutation(async ({ input }) => {
      return birthdayProgram.assignNextEventCredit(input);
    }),

    // Crea (si faltan) los 4 productos de premio del evento elegido --
    // botón "Crear productos de premio" en el admin. Idempotente: no
    // duplica los que ya existan por internalCode.
    createRewardProducts: adminProcedure.input(z.object({
      eventId: z.number(),
    })).mutation(async ({ input }) => {
      return birthdayProgram.createBirthdayRewardProducts(input.eventId);
    }),
  }),

  // Stock de la barra por insumos (server/insumos.ts): insumos, recetas de
  // cada trago, compras, conteos y la lista de compras proyectada.
  insumos: router({
    schema: adminProcedure.query(() => insumoSchemaStatus()),
    schemaApply: adminPasswordProcedure.mutation(async ({ ctx }) => {
      try {
        const r = await applyInsumoSchema();
        await db.recordAdminAudit({ action: 'system.insumoSchemaApply', targetType: 'schema', payload: r, ip: clientIp(ctx) });
        return { ...r, ...(await insumoSchemaStatus()) };
      } catch (e: any) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `No se pudo actualizar la base: ${e?.message ?? 'error desconocido'}` });
      }
    }),
    estado: adminProcedure.input(z.object({ eventId: z.number() })).query(({ input }) => insumoSvc.estadoBarra(input.eventId)),
    // Carga del dosier del aniversario: primero se ve qué haría (dosierPlan), después se aplica.
    dosierPlan: adminProcedure.input(z.object({ eventId: z.number() }))
      .query(({ input }) => insumoSvc.dosierPlan(input.eventId)),
    dosierApply: adminProcedure.input(z.object({
      eventId: z.number(), reemplazarRecetas: z.boolean(), cargarStock: z.boolean(),
      // A qué productos de la Carta se copia cada preparación del dosier.
      asignaciones: z.array(z.object({ receta: z.string().max(100), productIds: z.array(z.number()).max(100) })).max(100),
    }))
      .mutation(async ({ input, ctx }) => {
        try {
          const r = await insumoSvc.dosierApply(input);
          await db.recordAdminAudit({ action: 'insumos.dosierApply', targetType: 'event', targetId: input.eventId, eventId: input.eventId, payload: { ...input, ...r }, ip: clientIp(ctx) });
          return r;
        } catch (e: any) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: e?.message ?? 'No se pudo cargar el dosier' });
        }
      }),
    save: adminProcedure.input(z.object({
      id: z.number().optional(), name: z.string().trim().min(1).max(100), unit: z.enum(['ml', 'g', 'un']),
      containerSize: z.number().min(1).max(1_000_000), containerLabel: z.string().max(30),
      sizes: z.array(z.number().int().min(1).max(1_000_000)).max(10).optional(),
      costPerContainer: z.number().min(0).nullable().optional(), alertDrinks: z.number().int().min(0).max(10_000), sortOrder: z.number().int().optional(),
      // Al crear: con cuánto parte (en envases cerrados + suelto en la unidad del insumo).
      initialBySize: z.array(z.object({ size: z.number().int().min(1), count: z.number().min(0).max(100_000) })).max(20).optional(), initialLoose: z.number().min(0).optional(),
    })).mutation(async ({ input }) => {
      const { initialBySize, initialLoose, ...data } = input;
      const saved = await insumoSvc.saveInsumo(data);
      const bottles = (initialBySize ?? []).filter((b) => b.count > 0);
      const initial = bottles.reduce((s, b) => s + b.size * b.count, 0) + (initialLoose ?? 0);
      if (!input.id && initial > 0) {
        await insumoSvc.addMovimiento({ insumoId: saved.id, kind: 'carga', amount: initial, note: `Stock inicial: ${describirBotellas(bottles, input.unit)}${initialLoose ? ` + ${initialLoose} ${input.unit}` : ''}` });
      }
      return saved;
    }),
    setActive: adminProcedure.input(z.object({ id: z.number(), active: z.boolean() })).mutation(({ input }) => insumoSvc.setInsumoActive(input.id, input.active)),
    // Vista por botella base: qué tragos usan este insumo y cuánto.
    setUso: adminProcedure.input(z.object({
      eventId: z.number(), insumoId: z.number(),
      usos: z.array(z.object({ ticketTypeId: z.number(), amount: z.number().min(0).max(100_000) })).max(500),
    })).mutation(({ input }) => insumoSvc.setUsoInsumo(input.eventId, input.insumoId, input.usos)),
    // Compra desde la foto de una boleta: la IA solo lee y propone (nada se escribe); `comprasAplicar` carga lo que el admin confirmó.
    // Las fichas del dosier para verlas en pantalla en el admin (con el botón de editar cada receta).
    dosierFichas: adminProcedure.input(z.object({ eventId: z.number() })).query(({ input }) => dosierFichas(input.eventId)),
    // Dosier de barra en PDF: link firmado por 7 días (para descargar o mandar por WhatsApp al staff).
    dosierLink: adminProcedure.input(z.object({ eventId: z.number() })).mutation(({ input }) => {
      const { token, expiresAt } = firmarDosier(input.eventId, DOSIER_TTL_ADMIN);
      return { path: dosierPath(token), expiresAt };
    }),
    comprasLeer: adminProcedure.input(z.object({ imageUrl: z.string().url() })).mutation(async ({ input }) => {
      try {
        return await comprasSvc.proponerCompra(input.imageUrl);
      } catch (err) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'No se pudo leer la foto. Intenta con otra más nítida, o carga la compra a mano.', cause: err });
      }
    }),
    // Aprende al tiro cómo aparece un insumo en las boletas (sin esperar a «Cargar compra»).
    comprasAprender: adminProcedure.input(z.object({ insumoId: z.number(), alias: z.string().min(2).max(160) }))
      .mutation(async ({ input }) => { await comprasSvc.aprenderAlias(input.insumoId, input.alias); return { ok: true as const }; }),
    comprasAplicar: adminProcedure.input(z.object({
      opId: z.string().min(8).max(40), eventId: z.number(),
      lineas: z.array(z.object({
        insumoId: z.number(), agregar: z.number().positive().max(10_000_000), costoParaInsumo: z.number().min(0).max(100_000_000).nullable(),
        alias: z.string().max(160).nullable(), detalle: z.string().max(120),
      })).min(1).max(150),
      actualizarCostos: z.boolean(), recordarNombres: z.boolean(),
      gasto: z.object({
        crear: z.boolean(), proveedor: z.string().max(160), rut: z.string().max(16), fecha: z.string().max(40),
        documentType: z.enum(['boleta', 'factura', 'boleta_honorarios', 'sin_documento']), numero: z.string().max(32),
        total: z.number().min(0).max(500_000_000), ivaExempt: z.boolean(), receiptUrl: z.string().url().nullable(),
      }),
    })).mutation(({ input, ctx }) => comprasSvc.aplicarCompra({ ...input, userId: ctx.user.id })),
    setTipoProducto: adminProcedure.input(z.object({ ticketTypeId: z.number(), tipo: z.enum(['trago', 'comida', 'cigarros', 'merch', 'otro']) }))
      .mutation(({ input }) => insumoSvc.setTipoProducto(input.ticketTypeId, input.tipo)),
    setProductoOculto: adminProcedure.input(z.object({ ticketTypeId: z.number(), oculto: z.boolean() }))
      .mutation(({ input }) => insumoSvc.setProductoOculto(input.ticketTypeId, input.oculto)),
    setReceta: adminProcedure.input(z.object({
      ticketTypeId: z.number(), glass: z.enum(['vaso', 'copa', 'copa_xl', 'shot', 'botella']), lines: z.array(z.object({ insumoId: z.number(), amount: z.number().min(0).max(100_000) })).max(30),
      // Extras sin medida (borde de Tajín, hielo frappé…): solo anotados en el producto.
      extras: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
      // Opciones que la cajera elige al vender (con qué bebida va, qué variante es).
      opciones: z.array(z.object({
        id: z.string().min(1).max(40), label: z.string().trim().min(1).max(40), reemplaza: z.number().nullable(),
        choices: z.array(z.object({ id: z.string().min(1).max(40), label: z.string().trim().min(1).max(40), insumoId: z.number(), amount: z.number().positive().max(100_000) })).min(1).max(12),
      })).max(5).optional(),
      // Para el dosier: pasos de preparación (vacío = los sugeridos) y foto del trago.
      pasos: z.array(z.string().trim().max(160)).max(12).optional(),
      foto: z.string().url().max(500).nullable().optional(),
    })).mutation(({ input }) => insumoSvc.setReceta(input.ticketTypeId, input.glass, input.lines, input.extras, input.opciones, { pasos: input.pasos, foto: input.foto })),
    movimiento: adminProcedure.input(z.object({
      insumoId: z.number(), kind: z.enum(['carga', 'compra', 'merma', 'ajuste']), amount: z.number().min(-10_000_000).max(10_000_000),
      eventId: z.number().nullable().optional(), note: z.string().max(255).optional(),
    })).mutation(({ input }) => insumoSvc.addMovimiento(input)),
    setStock: adminProcedure.input(z.object({ insumoId: z.number(), target: z.number().min(0), eventId: z.number().nullable().optional(), note: z.string().max(255).optional() }))
      .mutation(({ input }) => insumoSvc.setStockTo(input)),
    movimientos: adminProcedure.input(z.object({ eventId: z.number().optional(), insumoId: z.number().optional(), limit: z.number().int().max(1000).optional() }))
      .query(({ input }) => insumoSvc.listMovimientos(input)),
    conteos: adminProcedure.input(z.object({ eventId: z.number() })).query(({ input }) => insumoSvc.listConteos(input.eventId)),
    proyeccion: adminProcedure.input(z.object({
      eventId: z.number(), personas: z.number().int().min(1).max(100_000), factor: z.number().min(0.1).max(5).optional(),
      tragosPorPersona: z.number().min(0).max(50).nullable().optional(), overrides: z.record(z.string(), z.number().min(0)).optional(),
    })).query(({ input }) => insumoSvc.proyeccion({
      ...input, overrides: input.overrides ? Object.fromEntries(Object.entries(input.overrides).map(([k, v]) => [Number(k), v])) : undefined,
    })),
  }),

  // Módulo /caja — login por PIN de operadores (docs/ARQUITECTURA-CAJA.md
  // Fase 0). Sesión separada de auth.adminLogin: no toca `users` ni COOKIE_NAME.
  caja: router({
    // Enrolamiento de dispositivo (pedido explícito del usuario) -- sin
    // esto, ni siquiera se llega a la pantalla de PIN. publicProcedure a
    // propósito: todavía no hay ni operador ni dispositivo.
    deviceStatus: publicProcedure.query(({ ctx }) => {
      return ctx.device ? { enrolled: true as const, deviceName: ctx.device.name } : { enrolled: false as const };
    }),
    enrollDevice: publicProcedure.input(z.object({ code: z.string().min(1) })).mutation(async ({ input, ctx }) => {
      const code = input.code.trim().toUpperCase();
      const device = await db.getDeviceByEnrollCode(code);
      if (!device || device.enrolled || !device.enrollCodeExpiresAt || new Date(device.enrollCodeExpiresAt).getTime() < Date.now()) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Código de enrolamiento inválido o vencido' });
      }
      const token = generateDeviceToken();
      await db.completeDeviceEnrollment(device.id, hashDeviceToken(token));
      const sessionToken = await signDeviceSession(device.id);
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(CAJA_DEVICE_COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: DEVICE_SESSION_MS });
      return { success: true, deviceName: device.name } as const;
    }),

    // Pantalla "toca tu nombre" (§10.2) — nunca expone pinHash. Requiere
    // dispositivo enrolado (deviceProcedure), y solo muestra operadores del
    // mismo evento al que el dispositivo fue enrolado.
    listOperators: deviceProcedure.query(async ({ ctx }) => {
      // Solo quienes usan la caja: acceso/cocina/guardarropía tienen su
      // propia pantalla (y el login de acá los rechaza igual).
      const all = await db.listActiveOperatorsPublic(ctx.device.eventId);
      return all.filter((o) => canUseCaja(o.role));
    }),
    login: deviceProcedure.input(z.object({ operatorId: z.number(), pin: z.string().min(4).max(8) })).mutation(async ({ input, ctx }) => {
      const operator = await verifyOperatorPinOrThrow(ctx, input.operatorId, input.pin);
      // Defensa en profundidad: aunque listOperators ya filtra por evento,
      // esto bloquea que un cliente con caché vieja loguee un operador de
      // otro evento en este dispositivo.
      if (operator.eventId !== ctx.device.eventId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Este operador no pertenece al evento de este dispositivo' });
      }
      if (!canUseCaja(operator.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Este usuario no usa la caja (es de otra pantalla)' });
      }
      const sessionToken = await signOperatorSession({ operatorId: operator.id, role: operator.role, name: operator.name });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(CAJA_COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: CAJA_SESSION_MS });
      return { id: operator.id, name: operator.name, role: operator.role };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(CAJA_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    me: publicProcedure.query(({ ctx }) => ctx.operator),

    // Pantallas de /caja (docs/ARQUITECTURA-CAJA.md Fase 2) — todas requieren
    // sesión de operador vigente.
    //
    // Antes usaba una heurística global (evento publicado con fecha más
    // cercana a hoy), lo que podía cruzar catálogos entre dos eventos
    // "published" simultáneos durante el cambio de fiesta. Ahora resuelve
    // directo desde el evento al que el dispositivo fue enrolado -- es un
    // arreglo de comportamiento, no solo plumbing.
    // Si el evento real del dispositivo está FUERA de su horario de fiesta
    // (puertas/fin de evento, `isPartyWindowOpen`), se vende contra un
    // evento de pruebas permanente en su lugar -- así ninguna venta de
    // prueba (probando días antes/después del evento real) contamina el
    // dashboard/P&L del evento real, sin tocar ninguna de esas fórmulas
    // (todas ya filtran por eventId, y acá cambia el eventId, no ellas).
    // El operador/registro siguen siendo los del dispositivo real: nada
    // los valida contra el eventId de la venta (ver server/caja/sale.ts).
    activeEvent: operatorProcedure.query(async ({ ctx }) => {
      if (!ctx.device) throw new TRPCError({ code: 'FORBIDDEN', message: 'Este dispositivo no está enrolado' });
      const real = await db.getEventById(ctx.device.eventId);
      if (real && isPartyWindowOpen(real)) return real;
      return db.getOrCreateCajaTestEvent();
    }),
    dashboard: operatorProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return db.getCajaDashboard(input.eventId);
    }),
    // Descarga completa para el modo offline (docs/ARQUITECTURA-CAJA.md
    // §6.2) -- la tablet la guarda en IndexedDB al abrir turno y la
    // refresca cada 60s cuando hay conexión.
    snapshot: operatorProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      const snapshot = await db.getCajaSnapshot(input.eventId);
      // Stock de la barra por insumos: viaja con el snapshot para calcular
      // "quedan ~N tragos" también sin señal.
      // El dosier viaja con el snapshot para abrirlo en la tablet sin señal (fichas de preparación, sin precios ni costos).
      return snapshot ? { ...snapshot, barra: await insumoSvc.cajaInsumoSnapshot(input.eventId), dosier: await dosierFichas(input.eventId).catch(() => null) } : snapshot;
    }),
    // Conteo de barra al abrir y al cerrar turno: cualquiera de la barra lo
    // hace desde su tablet o celular. Lo contado pasa a ser el stock real.
    // Dosier de barra para los chicos de la barra: link firmado por 12 horas del evento de la caja.
    dosierLink: operatorProcedure.input(z.object({ eventId: z.number() })).mutation(({ input }) => {
      const { token, expiresAt } = firmarDosier(input.eventId, DOSIER_TTL_CAJA);
      return { path: dosierPath(token), expiresAt };
    }),
    barraEstado: operatorProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      const estado = await insumoSvc.estadoBarra(input.eventId);
      if (!estado.ready) return { ready: false as const, insumos: [], ultimaApertura: null, ultimoCierre: null };
      const [ultimaApertura, ultimoCierre] = await Promise.all([
        insumoSvc.ultimoConteo(input.eventId, 'apertura'), insumoSvc.ultimoConteo(input.eventId, 'cierre'),
      ]);
      return { ready: true as const, insumos: estado.insumos, ultimaApertura, ultimoCierre };
    }),
    conteoBarra: operatorProcedure.input(z.object({
      eventId: z.number(), registerId: z.number().optional(), kind: z.enum(['apertura', 'cierre']),
      // Cada botella con su tamaño (750 / 1000 / 1500 ml…). closedContainers/openFraction es el formato
      // anterior, por si una tablet quedó con la pantalla vieja abierta.
      lines: z.array(z.object({
        insumoId: z.number(),
        closed: z.array(z.object({ size: z.number().int().min(1).max(1_000_000), count: z.number().int().min(0).max(10000) })).max(20).optional(),
        open: z.array(z.object({ size: z.number().int().min(1).max(1_000_000), portions: z.number().min(0).max(10) })).max(50).optional(),
        closedContainers: z.number().int().min(0).max(10000).optional(), openFraction: z.number().min(0).max(1).optional(),
      })).min(1).max(500),
    })).mutation(async ({ input, ctx }) => {
      const shift = await db.getOpenShift(input.eventId, input.registerId);
      try {
        const result = await insumoSvc.crearConteo({
          eventId: input.eventId, registerId: input.registerId ?? null, shiftId: shift?.id ?? null, kind: input.kind,
          operatorId: ctx.operator.operatorId, operatorName: ctx.operator.name, lines: input.lines,
        });
        if (input.kind === 'cierre' && !result.test) await alertConteoDescuadre(input.eventId, result.conteoId, ctx.operator.name, result.forAlerts);
        return { conteoId: result.conteoId, test: result.test, lines: result.lines };
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo guardar el conteo' });
      }
    }),
    // Procesa un lote de operaciones encoladas offline (§7) -- reutiliza
    // exactamente la misma lógica idempotente (applyOp) que los endpoints
    // online `redeem`/`sale`, así que reenviar el mismo opId nunca duplica nada.
    sync: operatorProcedure.input(z.object({
      eventId: z.number(),
      registerId: z.number().optional(),
      ops: z.array(z.discriminatedUnion('type', [
        z.object({ type: z.literal('redeem'), opId: z.string(), displayCode: z.string(), clientAt: z.string() }),
        // El «Deshacer» de 60 s tras cobrar un extra (server/caja/undoRedeem.ts).
        z.object({ type: z.literal('undo_redeem'), opId: z.string(), displayCode: z.string(), clientAt: z.string() }),
        z.object({ type: z.literal('checkin'), opId: z.string(), ticketCode: z.string(), clientAt: z.string() }),
        z.object({
          type: z.literal('sale'), opId: z.string(),
          items: z.array(z.object({ ticketTypeId: z.number(), quantity: z.number().min(1), opciones: z.array(z.string().max(40)).max(5).optional() })).min(1),
          paymentMethod: z.enum(['efectivo', 'debito', 'credito', 'qr']),
          buyerEmail: z.string().email().optional(),
          redeemPlaycoins: z.number().int().min(0).optional(),
          discountCode: z.string().optional(),
          lockerTag: z.string().max(16).optional(),
          lockerCustomerName: z.string().max(120).optional(),
          kitchenTicketNumber: z.string().max(12).optional(),
          customerName: z.string().max(60).optional(),
          clientAt: z.string(),
        }),
      ])).max(50),
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await db.getDb();
      if (!rawDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Base de datos no disponible' });

      const results: Record<string, { result: string; conflictNote?: string }> = {};
      for (const op of input.ops) {
        try {
          if (op.type === 'redeem') {
            results[op.opId] = await redeemDisplayCode(rawDb, {
              opId: op.opId, displayCode: op.displayCode, eventId: input.eventId,
              operatorId: ctx.operator.operatorId, registerId: input.registerId, clientAt: new Date(op.clientAt),
            });
          } else if (op.type === 'undo_redeem') {
            results[op.opId] = await undoRedeemDisplayCode(rawDb, {
              opId: op.opId, displayCode: op.displayCode, eventId: input.eventId,
              operatorId: ctx.operator.operatorId, registerId: input.registerId, clientAt: new Date(op.clientAt),
            });
          } else if (op.type === 'checkin') {
            results[op.opId] = await checkInTicket(rawDb, {
              opId: op.opId, ticketCode: op.ticketCode, eventId: input.eventId,
              operatorId: ctx.operator.operatorId, registerId: input.registerId, clientAt: new Date(op.clientAt),
            });
          } else {
            results[op.opId] = await createCajaSale(rawDb, {
              opId: op.opId, eventId: input.eventId, operatorId: ctx.operator.operatorId, registerId: input.registerId,
              items: op.items, paymentMethod: op.paymentMethod, clientAt: new Date(op.clientAt),
              buyerEmail: op.buyerEmail, redeemPlaycoins: op.redeemPlaycoins,
              discountCode: op.discountCode, lockerTag: op.lockerTag, lockerCustomerName: op.lockerCustomerName,
              kitchenTicketNumber: op.kitchenTicketNumber, customerName: op.customerName,
            });
            if (results[op.opId].result === 'applied') {
              await checkSaleAlerts({ eventId: input.eventId, opId: op.opId, operatorName: ctx.operator.name });
            }
          }
        } catch (err) {
          results[op.opId] = { result: 'rejected', conflictNote: friendlySyncErrorMessage(err, op.opId) };
        }
      }
      return results;
    }),

    // Selección de caja física al abrir turno (§10.2.1).
    listRegisters: operatorProcedure.query(async ({ ctx }) => {
      if (!ctx.device) throw new TRPCError({ code: 'FORBIDDEN', message: 'Este dispositivo no está enrolado' });
      return db.listActiveRegisters(ctx.device.eventId);
    }),
    // Turno abierto de ESTA caja, según el servidor. Es la fuente de verdad:
    // antes el cliente solo miraba `sessionStorage`, que se borra cuando la
    // tablet reinicia la PWA (pantalla bloqueada un rato largo, otra app en
    // primer plano, pestaña cerrada) -- y ahí le volvía a pedir el efectivo
    // inicial a la cajera aunque el turno siguiera abierto en la base. Ese
    // era el bug que reportó el dueño del evento pasado.
    //
    // `eventId` es el MISMO que usan shiftOpen/shiftClose (el de activeEvent,
    // que fuera de horario es el de pruebas). Antes miraba siempre el evento
    // real del dispositivo: en modo prueba nunca encontraba el turno abierto,
    // volvía a pedir el fondo al recargar y a veces no dejaba cerrar.
    currentShift: operatorProcedure.input(z.object({
      eventId: z.number().optional(),
      registerId: z.number().optional(),
    })).query(async ({ input, ctx }) => {
      if (!ctx.device) throw new TRPCError({ code: 'FORBIDDEN', message: 'Este dispositivo no está enrolado' });
      const shift = await db.getOpenShift(input.eventId ?? ctx.device.eventId, input.registerId);
      if (!shift) return null;
      return {
        shiftId: shift.id,
        openingCash: Number(shift.openingCash),
        openedAt: shift.openedAt,
        openedByOperatorId: shift.operatorId,
      };
    }),
    // Apertura de turno con cuadre de caja (pedido explícito del usuario):
    // pide el efectivo inicial declarado por la cajera. Idempotente por
    // evento+caja (un refresh de página no duplica el turno abierto).
    shiftOpen: operatorProcedure.input(z.object({
      opId: z.string(), eventId: z.number(), registerId: z.number().optional(),
      openingCash: z.number().min(0), clientAt: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await db.getDb();
      if (!rawDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Base de datos no disponible' });
      if (!ctx.operator) throw new TRPCError({ code: 'UNAUTHORIZED' });
      const opened = await db.openShift({
        eventId: input.eventId, operatorId: ctx.operator.operatorId,
        registerId: input.registerId, openingCash: input.openingCash,
      });
      const { applyOp } = await import('./caja/ops');
      await applyOp(rawDb, {
        id: input.opId, type: 'shift_open', eventId: input.eventId, operatorId: ctx.operator.operatorId,
        registerId: input.registerId, targetType: 'operator', targetId: String(opened.shiftId),
        // `declaredCash` es lo que la cajera acaba de contar; `openingCash`
        // es el que quedó vigente. Cuando el turno ya estaba abierto los dos
        // difieren, y el ledger tiene que mostrar esa diferencia en vez de
        // registrar un fondo que nunca se aplicó.
        payload: {
          openingCash: opened.openingCash, declaredCash: input.openingCash,
          alreadyOpen: opened.alreadyOpen, shiftId: opened.shiftId,
        },
        clientAt: new Date(input.clientAt),
      }, async () => ({ result: 'applied' as const }));
      return opened;
    }),
    // Protocolo de pendientes (§13, riesgo 2): el cliente NO debe llamar esto
    // con ops sin sincronizar -- se bloquea en la UI, no acá, porque cerrar
    // el turno es una decisión operativa, no algo que el servidor pueda ver.
    // Pide efectivo TOTAL contado (no la diferencia) + totales de débito y
    // crédito de las máquinas, hace el cuadre contra las ventas registradas
    // (solo canal caja, nunca web) y manda el informe final por correo.
    shiftClose: operatorProcedure.input(z.object({
      opId: z.string(), eventId: z.number(), registerId: z.number().optional(),
      countedCash: z.number().min(0), countedDebit: z.number().min(0), countedCredit: z.number().min(0),
      countedQr: z.number().min(0).optional(),
      clientAt: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await db.getDb();
      if (!rawDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Base de datos no disponible' });
      if (!ctx.operator) throw new TRPCError({ code: 'UNAUTHORIZED' });

      const openShift = await db.getOpenShift(input.eventId, input.registerId);
      if (!openShift) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No hay un turno abierto para cerrar' });

      const report = await db.closeShift({
        shiftId: openShift.id, closedByOperatorId: ctx.operator.operatorId,
        countedCash: input.countedCash, countedDebit: input.countedDebit, countedCredit: input.countedCredit,
        countedQr: input.countedQr,
      });

      const { applyOp } = await import('./caja/ops');
      await applyOp(rawDb, {
        id: input.opId, type: 'shift_close', eventId: input.eventId, operatorId: ctx.operator.operatorId,
        registerId: input.registerId, targetType: 'operator', targetId: String(ctx.operator.operatorId),
        payload: report, clientAt: new Date(input.clientAt),
      }, async () => ({ result: 'applied' as const }));

      // No debe tumbar el cierre de turno si Resend falla -- el reporte ya
      // quedó guardado y disponible en /admin de todas formas. El PDF va
      // adjunto siempre al admin, y además a la cajera dueña del turno si
      // tiene un email cargado en su ficha de operador (pedido explícito
      // del usuario) -- para cuadrar la caja con ella ahí mismo.
      let emailSent = false;
      try {
        const pdf = await buildShiftClosePdf(report);
        const attachments = [{ filename: `cierre-turno-${report.registerName}.pdf`, content: pdf }];
        const html = buildShiftCloseEmail(report);
        const subject = `[Cierre de turno] ${report.eventTitle} — ${report.registerName}`;

        const recipients = [SHIFT_CLOSE_REPORT_EMAIL, ...(report.operatorEmail ? [report.operatorEmail] : [])];
        const results = await Promise.all(
          recipients.map((to) => sendEmail({ to, subject, html, attachments }))
        );
        emailSent = results.every((r) => r.success);
      } catch (err) {
        console.error('[shiftClose] Error al enviar el correo de cierre:', err);
      }

      await alertShiftClosed(input.eventId, report);

      return { ...report, emailSent };
    }),

    // Anulación con motivo -- solo supervisor/admin (docs/ARQUITECTURA-CAJA.md §3.2).
    voidCode: supervisorProcedure.input(z.object({
      opId: z.string(),
      eventId: z.number(),
      displayCode: z.string().min(1),
      reason: z.string().min(3, 'El motivo es obligatorio'),
      registerId: z.number().optional(),
      clientAt: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await db.getDb();
      if (!rawDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Base de datos no disponible' });
      if (!ctx.operator) throw new TRPCError({ code: 'UNAUTHORIZED' });
      return voidTicketCode(rawDb, {
        opId: input.opId, displayCode: input.displayCode, eventId: input.eventId,
        operatorId: ctx.operator.operatorId, registerId: input.registerId, reason: input.reason,
        clientAt: new Date(input.clientAt),
      });
    }),

    // Cola de conflictos para el supervisor (§8): canjes dobles todavía sin
    // revisar. "Resuelto" = existe un op manual_adjust posterior que lo referencia.
    conflictQueue: supervisorProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return db.getConflictQueue(input.eventId);
    }),
    resolveConflict: supervisorProcedure.input(z.object({
      opId: z.string(),
      eventId: z.number(),
      conflictOpId: z.string(),
      note: z.string().optional(),
      clientAt: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await db.getDb();
      if (!rawDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Base de datos no disponible' });
      if (!ctx.operator) throw new TRPCError({ code: 'UNAUTHORIZED' });
      return db.resolveConflict(rawDb, {
        opId: input.opId, eventId: input.eventId, operatorId: ctx.operator.operatorId,
        conflictOpId: input.conflictOpId, note: input.note, clientAt: new Date(input.clientAt),
      });
    }),
    // Historial completo de ventas de la noche (pedido explícito del dueño):
    // con scroll, buscable por cliente/orden/email/producto/cajera, para
    // ubicar rápido cualquier venta ante un reclamo o un error de cobro.
    // Incluye las anuladas (marcadas), nunca las esconde.
    salesHistory: operatorProcedure.input(z.object({
      eventId: z.number(),
      search: z.string().max(100).optional(),
      paymentMethod: z.enum(['efectivo', 'debito', 'credito', 'qr', 'saldo']).optional(),
      status: z.enum(['approved', 'refunded']).optional(),
      cursor: z.number().optional(), // id de la última venta de la página anterior
      limit: z.number().min(1).max(100).default(30),
    })).query(async ({ input }) => {
      return db.getCajaSalesHistory(input);
    }),
    saleDetail: operatorProcedure.input(z.object({ eventId: z.number(), orderNumber: z.string().min(1) })).query(async ({ input }) => {
      const detail = await db.getCajaSaleDetail(input.eventId, input.orderNumber);
      if (!detail) throw new TRPCError({ code: 'NOT_FOUND', message: 'Venta no encontrada' });
      return detail;
    }),
    // Anular una venta completa -- SOLO con la clave de admin del dueño
    // (ADMIN_PASSWORD), la sepa o no la persona logueada en la caja. El
    // límite de intentos es por IP y con clave propia (no bloquea el panel).
    // Cada intento con clave mala y cada anulación avisan al dueño por push.
    voidSale: operatorProcedure.input(z.object({
      opId: z.string(),
      eventId: z.number(),
      orderNumber: z.string().min(1),
      reason: z.string().trim().min(5, 'Escribe el motivo de la anulación (mínimo 5 letras)').max(300),
      adminPassword: z.string().min(1, 'Ingresa la clave de admin'),
      registerId: z.number().optional(),
      clientAt: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await db.getDb();
      if (!rawDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Base de datos no disponible' });
      if (!(await checkAdminPassword(ctx, input.adminPassword, 'caja-void'))) {
        await alertWrongAdminPassword({ eventId: input.eventId, operatorName: ctx.operator.name, orderNumber: input.orderNumber });
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Clave de admin incorrecta' });
      }
      const res = await voidCajaSale(rawDb, {
        opId: input.opId, orderNumber: input.orderNumber, eventId: input.eventId,
        operatorId: ctx.operator.operatorId, registerId: input.registerId,
        reason: input.reason, ip: clientIp(ctx), clientAt: new Date(input.clientAt),
      });
      if (res.result === 'applied' && res.order) {
        await alertSaleVoided({
          eventId: input.eventId, orderNumber: res.order.orderNumber, total: res.order.total,
          paymentMethod: res.order.paymentMethod, buyerName: res.order.buyerName, reason: input.reason, operatorName: ctx.operator.name,
        });
      }
      return res;
    }),
    redeem: operatorProcedure.input(z.object({
      opId: z.string(),
      eventId: z.number(),
      displayCode: z.string().min(1),
      registerId: z.number().optional(),
      clientAt: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await db.getDb();
      if (!rawDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Base de datos no disponible' });
      return redeemDisplayCode(rawDb, {
        opId: input.opId,
        displayCode: input.displayCode,
        eventId: input.eventId,
        operatorId: ctx.operator.operatorId,
        registerId: input.registerId,
        clientAt: new Date(input.clientAt),
      });
    }),
    // Marca la entrada de un acceso en la puerta (mismo ledger idempotente
    // que `redeem`, pero por ticketCode y solo para category='acceso').
    checkin: operatorProcedure.input(z.object({
      opId: z.string(),
      eventId: z.number(),
      ticketCode: z.string().min(1),
      registerId: z.number().optional(),
      clientAt: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await db.getDb();
      if (!rawDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Base de datos no disponible' });
      return checkInTicket(rawDb, {
        opId: input.opId,
        ticketCode: input.ticketCode,
        eventId: input.eventId,
        operatorId: ctx.operator.operatorId,
        registerId: input.registerId,
        clientAt: new Date(input.clientAt),
      });
    }),
    // 'saldo' (pedido explícito del dueño): cubre el 100% del total o se
    // rechaza, nunca combinado con otro medio -- y SOLO se puede pagar
    // llamando este procedure directo (nunca por caja.sync, que no lo
    // acepta en su discriminatedUnion): el saldo exige conexión siempre, a
    // diferencia de efectivo/débito/crédito/qr, que sí viajan por la cola
    // offline. `cardPin` es requerido cuando paymentMethod==='saldo'.
    // QR de «Pagar en caja» de la app de socios: valida (sin consumir) y devuelve a quién cobrar.
    resolvePayToken: operatorProcedure.input(z.object({ eventId: z.number(), token: z.string().max(80) })).mutation(async ({ input }) => {
      if (!(await members.getMemberConfig()).payments.cajaPay) throw new TRPCError({ code: 'BAD_REQUEST', message: 'El pago con la app no está activado' });
      const check = await memberPay.resolvePayToken(input.token);
      if (!check.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: check.reason });
      const c = await members.findCustomer(check.email);
      return { email: check.email, name: c?.fullName ?? null, prepaidBalance: c?.prepaidBalance ?? 0, playcoins: c?.playcoins ?? 0 };
    }),
    // Buscar un cliente registrado por nombre, correo, RUT o teléfono (la lista local solo trae a quienes ya entraron).
    findCustomer: operatorProcedure.input(z.object({ query: z.string().trim().min(3).max(80) })).query(async ({ input }) => {
      const rawDb = await db.getDb();
      if (!rawDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Base de datos no disponible' });
      return findCustomersForCaja(rawDb, input.query);
    }),
    // Estado de la tarjeta al identificar al cliente: saldo en PLATA (el que gasta «Saldo»), Playcoins, si tiene PIN y
    // cuántos intentos le quedan. La caja lo consulta sola para que la cajera sepa de entrada si alcanza y si hay PIN.
    cardStatus: operatorProcedure.input(z.object({ eventId: z.number().optional(), email: z.string().email() })).query(async ({ input }) => {
      const s = await db.getCardPinStatus(input.email);
      return s ? { found: true as const, ...s, lockedUntil: s.lockedUntil?.toISOString() ?? null } : { found: false as const };
    }),
    // Supervisores/admin del evento, para que el cajero elija quién autoriza un cobro sin PIN.
    listSupervisors: operatorProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      const all = await db.listActiveOperatorsPublic(input.eventId);
      return all.filter((o: any) => o.role === 'supervisor' || o.role === 'admin').map((o: any) => ({ id: o.id, name: o.name }));
    }),
    // Cliente que olvidó el PIN: un supervisor/admin pone SU PIN de operador y se emite un token de un solo uso
    // (2 min, ligado al correo, con tope por venta) que `sale` acepta en lugar del PIN de la tarjeta.
    authorizeCardPay: operatorProcedure.input(z.object({
      eventId: z.number(), email: z.string().email(), supervisorId: z.number(), pin: z.string().regex(/^\d{4,8}$/),
    })).mutation(async ({ input, ctx }) => {
      if (!(await members.getMemberConfig()).payments.cajaPay) throw new TRPCError({ code: 'BAD_REQUEST', message: 'El pago con la app no está activado' });
      const supervisor = await verifyOperatorPinOrThrow(ctx, input.supervisorId, input.pin);
      if (supervisor.role !== 'supervisor' && supervisor.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: 'Esa persona no es supervisor' });
      const customer = await members.findCustomer(input.email);
      if (!customer) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No encontramos la cuenta de ese cliente' });
      console.warn(`[caja] cobro sin PIN autorizado: supervisor #${supervisor.id} (${supervisor.name}), cajero #${ctx.operator.operatorId}, cliente ${customer.email}`);
      const { token, expiresAt } = await memberPay.createSupervisorPayToken(customer.email, supervisor.id);
      return { token, expiresAt: expiresAt.toISOString(), supervisorName: supervisor.name as string, maxClp: memberPay.SUPERVISOR_PAY_MAX_CLP };
    }),
    sale: operatorProcedure.input(z.object({
      opId: z.string(),
      eventId: z.number(),
      items: z.array(z.object({ ticketTypeId: z.number(), quantity: z.number().min(1), opciones: z.array(z.string().max(40)).max(5).optional() })).min(1),
      paymentMethod: z.enum(['efectivo', 'debito', 'credito', 'qr', 'saldo']),
      registerId: z.number().optional(),
      buyerEmail: z.string().email().optional(),
      cardPin: z.string().regex(/^\d{4}$/).optional(),
      payToken: z.string().max(80).optional(),
      redeemPlaycoins: z.number().int().min(0).optional(),
      discountCode: z.string().optional(),
      lockerTag: z.string().max(16).optional(),
      lockerCustomerName: z.string().max(120).optional(),
      kitchenTicketNumber: z.string().max(12).optional(),
      customerName: z.string().max(60).optional(),
      clientAt: z.string(),
    })).mutation(async ({ input, ctx }) => {
      if (input.payToken && !(await members.getMemberConfig()).payments.cajaPay) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'El pago con la app no está activado' });
      }
      if (input.paymentMethod === 'saldo' && (!input.buyerEmail || (!input.cardPin && !input.payToken))) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Pagar con saldo necesita el email y el PIN de la tarjeta (o el QR de la app)' });
      }
      const rawDb = await db.getDb();
      if (!rawDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Base de datos no disponible' });
      try {
        const saleResult = await createCajaSale(rawDb, {
          opId: input.opId,
          eventId: input.eventId,
          operatorId: ctx.operator.operatorId,
          registerId: input.registerId,
          items: input.items,
          paymentMethod: input.paymentMethod,
          buyerEmail: input.buyerEmail,
          cardPin: input.cardPin,
          payToken: input.payToken,
          redeemPlaycoins: input.redeemPlaycoins,
          discountCode: input.discountCode,
          lockerTag: input.lockerTag,
          lockerCustomerName: input.lockerCustomerName,
          kitchenTicketNumber: input.kitchenTicketNumber,
          customerName: input.customerName,
          clientAt: new Date(input.clientAt),
        });
        if (saleResult.result === 'applied') {
          await checkSaleAlerts({ eventId: input.eventId, opId: input.opId, operatorName: ctx.operator.name });
        }
        return saleResult;
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo registrar la venta' });
      }
    }),

    // Reset de datos de prueba de caja/cocina/guardarropía antes del
    // estreno real (pedido explícito del usuario, pensado para usarse las
    // veces que haga falta mientras siga probando). Ver db.resetEventTestData
    // para el detalle exacto de qué toca y qué deja intacto (nunca compras
    // web, check-ins de puerta ni canjes de extras).
    resetTestData: adminPasswordProcedure.input(z.object({ eventId: z.number() })).mutation(async ({ input, ctx }) => {
      const result = await db.resetEventTestData(input.eventId);
      await db.recordAdminAudit({ action: 'caja.resetTestData', targetType: 'event', targetId: input.eventId, eventId: input.eventId, payload: result, ip: clientIp(ctx) });
      return result;
    }),
  }),

  // Solteros: solicitudes desde la app y aprobación por persona (server/solteros.ts).
  solteros: router({
    // Cada solicitud con su cruce contra la lista de bloqueados: «block» (RUT, correo, teléfono o Instagram)
    // o «review» (solo el nombre coincide), para decidir con esa información a la vista.
    list: adminReadProcedure.query(async () => {
      const rows = await solteros.listSolteroApprovals();
      return Promise.all(rows.map(async (r) => {
        const hit = await db.findBlockedMatch([{ name: r.fullName, rut: r.rut, email: r.email, phone: r.phone, instagram: r.instagram }]);
        return { ...r, blocked: hit.block.length > 0 ? 'block' as const : hit.review.length > 0 ? 'review' as const : null };
      }));
    }),
    review: adminProcedure.input(z.object({
      id: z.number().int().positive(),
      decision: z.enum(['aprobar', 'rechazar', 'revocar']),
      note: z.string().max(500).nullish(),
    })).mutation(async ({ input, ctx }) => {
      try {
        const r = await solteros.reviewSoltero(input.id, input.decision, input.note);
        await db.recordAdminAudit({ action: `solteros.${input.decision}`, targetType: 'solteroApproval', targetId: input.id, ip: clientIp(ctx) });
        return r;
      } catch (e: any) { throw new TRPCError({ code: 'BAD_REQUEST', message: e?.message ?? 'No se pudo guardar' }); }
    }),
    approveDirect: adminProcedure.input(z.object({ email: z.string().email().max(320), fullName: z.string().max(255).nullish() })).mutation(async ({ input, ctx }) => {
      try {
        const r = await solteros.approveSolteroDirect(input.email, input.fullName);
        await db.recordAdminAudit({ action: 'solteros.approveDirect', targetType: 'solteroApproval', payload: { email: r.email }, ip: clientIp(ctx) });
        return r;
      } catch (e: any) { throw new TRPCError({ code: 'BAD_REQUEST', message: e?.message ?? 'No se pudo aprobar' }); }
    }),
  }),

  // Gestión de operadores desde /admin (docs/ARQUITECTURA-CAJA.md §11).
  operators: router({
    listAll: adminReadProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return db.listAllOperators(input.eventId);
    }),
    create: adminProcedure.input(z.object({
      eventId: z.number(),
      name: z.string().min(1),
      pin: z.string().min(4).max(8),
      role: z.enum(OPERATOR_ROLES),
      // Opcional (pedido explícito del usuario): si está cargado, el cierre
      // de turno le manda el PDF de cuadre por correo a esta cajera.
      email: z.string().email().optional(),
    })).mutation(async ({ input }) => {
      const id = await db.createOperator({ eventId: input.eventId, name: input.name, pinHash: hashPin(input.pin), role: input.role, email: input.email });
      return { id };
    }),
    // `eventId` NO es editable acá a propósito: cada operador pertenece a un
    // solo evento (pedido explícito del usuario). Si trabaja en otra fiesta
    // se crea de nuevo ahí -- moverlo reasignaría silenciosamente su
    // historial pasado a otro evento.
    update: adminProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      pin: z.string().min(4).max(8).optional(),
      role: z.enum(OPERATOR_ROLES).optional(),
      active: z.number().min(0).max(1).optional(),
      email: z.string().email().nullable().optional(),
    })).mutation(async ({ input }) => {
      const { id, pin, ...rest } = input;
      await db.updateOperator(id, { ...rest, ...(pin ? { pinHash: hashPin(pin) } : {}) });
      return { success: true } as const;
    }),
    // Borrado real (pedido explícito del usuario: que no se vayan
    // acumulando) -- bloqueado si el operador ya tiene historial, ver
    // db.operatorHasHistory.
    delete: adminPasswordProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      try {
        const result = await db.deleteOperator(input.id);
        await db.recordAdminAudit({ action: 'operators.delete', targetType: 'operator', targetId: input.id, ip: clientIp(ctx) });
        return result;
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo eliminar el operador.' });
      }
    }),
  }),

  // Base de datos de clientes desde /admin (pedido explícito del usuario).
  customers: router({
    // Acompañantes de órdenes web (nombre + RUT, sin correo): no son parte de
    // `listAll`, así que nunca entran a una audiencia de mailing.
    attendees: adminReadProcedure.input(z.object({ search: z.string().optional() }).optional())
      .query(({ input }) => db.listAttendeeContacts(input?.search)),
    backfillAttendees: adminProcedure.mutation(async () => db.backfillAttendeeContacts()),
    listAll: adminReadProcedure.input(customerFiltersInput.optional()).query(({ input }) => customerRows(input ?? {})),
    // La tabla de Clientes: una página por vez (la lista entera solo para armar audiencias de mailing).
    // «¿A quién?» de Regalar: búsqueda en vivo (nombre, apellido, correo, teléfono o RUT, sin tildes), hasta 8.
    quickSearch: adminReadProcedure.input(z.object({ q: z.string().max(100) })).query(async ({ input }) => {
      const raw = await db.getDb();
      if (!raw) return [];
      return quickSearchCustomers(raw, input.q);
    }),
    page: adminReadProcedure.input(customerFiltersInput.extend({
      page: z.number().int().min(0).max(100_000).default(0),
      pageSize: z.number().int().min(10).max(100).default(25),
    })).query(async ({ input }) => {
      const { page, pageSize, ...filters } = input;
      // Los filtros viajan a la base y solo vuelve la página que se ve. Si esa consulta fallara, se cae a la
      // lista en memoria de siempre: la tabla nunca queda sin datos por esto.
      try {
        const now = new Date();
        const withApp = await appDevices.appUserEmails();
        const result = await pageCustomers(filters, page, pageSize, { now, appEmails: withApp });
        return { ...result, rows: decorateCustomers(result.rows, withApp, now) };
      } catch (err) {
        console.warn('[clientes] filtros en la base fallaron, uso la lista en memoria:', err);
        const rows = await customerRows(filters);
        const pages = Math.max(1, Math.ceil(rows.length / pageSize));
        const current = Math.min(page, pages - 1);
        return { rows: rows.slice(current * pageSize, (current + 1) * pageSize), total: rows.length, page: current, pages };
      }
    }),
    // Ficha completa: datos + historial por evento, valor, consumo y próxima acción.
    detail: adminReadProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const profile = await getCustomerProfile(input.id);
      if (!profile) throw new TRPCError({ code: 'NOT_FOUND', message: 'No encontré a ese cliente.' });
      return { ...profile, hasApp: (await appDevices.appUserEmails()).has(String(profile.customer.email).toLowerCase()) };
    }),
    // Edición manual de la ficha. Lo que se toca queda protegido de las
    // compras nuevas (lockedFields) y se deja en la bitácora de admin.
    update: adminProcedure.input(z.object({
      id: z.number(),
      email: z.string().max(320).optional(),
      fullName: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      rut: z.string().nullable().optional(),
      instagram: z.string().nullable().optional(),
      birthDate: z.string().nullable().optional(),
      gender: z.string().nullable().optional(),
      city: z.string().nullable().optional(),
      source: z.string().nullable().optional(),
      ambassadorCode: z.string().nullable().optional(),
      levelOverride: z.string().nullable().optional(),
      emailOptOut: z.boolean().optional(),
      whatsappOptOut: z.boolean().optional(),
      optOutReason: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, email, ...edit } = input;
      try {
        // El correo va primero: si no se puede cambiar, no se guarda nada más.
        let emailChange: Awaited<ReturnType<typeof changeCustomerEmail>> | null = null;
        if (email !== undefined) {
          emailChange = await changeCustomerEmail(id, email);
          if (emailChange.changed) {
            await db.recordAdminAudit({ action: 'customers.changeEmail', targetType: 'customer', targetId: id, payload: { antes: emailChange.previous, despues: emailChange.email, compras: emailChange.orders }, ip: clientIp(ctx) });
          }
        }
        const { changed } = await updateCustomerProfile(id, edit);
        if (Object.keys(changed).length > 0) {
          await db.recordAdminAudit({ action: 'customers.update', targetType: 'customer', targetId: id, payload: changed, ip: clientIp(ctx) });
        }
        return { success: true, changedFields: [...(emailChange?.changed ? ['email'] : []), ...Object.keys(changed)] } as const;
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo guardar la ficha.' });
      }
    }),
    // Borrar la ficha de un cliente (irreversible). Pide la clave de admin en
    // cada llamada, igual que borrar una compra. No toca compras ni ledgers.
    delete: adminPasswordProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      try {
        const { snapshot, skippedMailings } = await deleteCustomerProfile(input.id);
        await db.recordAdminAudit({ action: 'customers.delete', targetType: 'customer', targetId: input.id, payload: { ...snapshot, skippedMailings }, ip: clientIp(ctx) });
        return { success: true } as const;
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo borrar al cliente.' });
      }
    }),
    // Etiquetas existentes con su conteo -- alimenta los selectores de
    // "incluir/excluir etiqueta" al armar una campaña de mailing, para no
    // tener que escribir el nombre exacto de memoria.
    listTags: adminReadProcedure.query(async () => {
      return db.listCustomerTags();
    }),
    addTag: adminProcedure.input(z.object({ customerId: z.number(), tag: z.string().min(1) })).mutation(async ({ input }) => {
      await db.addCustomerTag(input.customerId, input.tag);
      return { success: true } as const;
    }),
    // Marcar como "ya enviado" en masa desde un CSV externo (pedido
    // explícito del usuario, ej. el reporte de entregados de Resend, que
    // trae la columna "to") -- no crea clientes nuevos, solo taguea los que
    // ya existen; los que no matchean se devuelven en notFound.
    bulkTagFromCsv: adminProcedure.input(z.object({
      csv: z.string().min(1),
      tag: z.string().min(1),
    })).mutation(async ({ input }) => {
      const rows = parseCsv(input.csv);
      const emails = extractEmailColumn(rows, ['to', 'email', 'correo']);
      if (emails.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No se encontró una columna "to"/"email" en el CSV.' });
      }
      return db.bulkAddTagByEmails(emails, input.tag);
    }),
    removeTag: adminProcedure.input(z.object({ customerId: z.number(), tag: z.string() })).mutation(async ({ input }) => {
      await db.removeCustomerTag(input.customerId, input.tag);
      return { success: true } as const;
    }),
    // Ajuste manual de Playcoins (pedido explícito del usuario) -- para
    // migrar saldos de Shopify a mano o corregir.
    adjustPlaycoins: adminProcedure.input(z.object({ customerId: z.number(), delta: z.number().int(), note: z.string().optional() })).mutation(async ({ input }) => {
      await db.adjustPlaycoinsManually(input.customerId, input.delta, input.note ?? '');
      return { success: true } as const;
    }),
    // Unir dos fichas de la misma persona (compró con dos correos).
    mergePreview: adminReadProcedure.input(z.object({ keepId: z.number().int(), fromId: z.number().int() })).query(async ({ input }) => {
      try { return await previewCustomerMerge(input.keepId, input.fromId); }
      catch (err) { throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo revisar' }); }
    }),
    merge: adminProcedure.input(z.object({ keepId: z.number().int(), fromId: z.number().int() })).mutation(async ({ input, ctx }) => {
      try {
        const r = await mergeCustomers(input.keepId, input.fromId);
        await db.recordAdminAudit({ action: 'customers.merge', targetType: 'customer', targetId: input.keepId, payload: { unido: r.fromEmail, en: r.keepEmail, compras: r.orders }, ip: clientIp(ctx) });
        return r;
      } catch (err) { throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudieron unir' }); }
    }),
    // Saldo PlayCard y PIN de la tarjeta (sección App / ficha del cliente).
    adjustPrepaid: adminProcedure.input(z.object({ customerId: z.number(), delta: z.number().int().min(-10_000_000).max(10_000_000).refine((n) => n !== 0), note: z.string().trim().min(3).max(500) })).mutation(async ({ input, ctx }) => {
      const by = ctx.user?.name ?? ctx.user?.email ?? 'admin';
      return db.adjustPrepaidManually(input.customerId, input.delta, `${input.note} (por ${by})`);
    }),
    resetCardPin: adminProcedure.input(z.object({ customerId: z.number(), notify: z.boolean().default(true) })).mutation(async ({ input }) => {
      const email = await db.resetCardPin(input.customerId);
      if (input.notify && email) {
        await customerPush.pushToEmail(email, { title: '🔑 Tu PIN de la PlayCard se reinició', body: 'Crea uno nuevo la próxima vez que recargues saldo.', url: '/cuenta' });
      }
      return { ok: true as const };
    }),
  }),

  // Mailing masivo desde /admin → Clientes (pedido explícito del usuario):
  // la IA solo genera texto estructurado (server/mailing.ts), el HTML de
  // marca se arma siempre acá con buildMailingBlastEmail.
  mailing: router({
    generateTemplate: adminProcedure.input(z.object({
      objective: z.string().min(5).max(1000),
      audienceDescription: z.string(),
    })).mutation(async ({ input }) => {
      try {
        return await generateMailingTemplate(input.objective, input.audienceDescription);
      } catch (err) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err instanceof Error ? err.message : 'No se pudo generar la plantilla.' });
      }
    }),
    renderPreview: adminProcedure.input(z.object({
      content: MailingContentSchema,
      ctaUrl: z.string(),
      sampleName: z.string().optional(),
      eventSections: mailingEventSectionsSchema,
      eventId: z.number().optional(),
    })).mutation(async ({ input }) => {
      const eventInfo = Object.values(input.eventSections).some(Boolean) ? await getMailingEventInfo() : null;
      const offer = input.content.theme ? await getCampaignOffer(input.eventId) : null;
      return {
        html: buildMailingBlastEmail({ ...input.content, buyerName: input.sampleName || 'Camila', ctaUrl: input.ctaUrl, eventInfo, eventSections: input.eventSections, priceList: offer?.priceList, remaining: offer?.remaining }),
      };
    }),
    sendBatch: adminProcedure.input(z.object({
      customerIds: z.array(z.number()).min(1).max(MAILING_BATCH_MAX),
      content: MailingContentSchema,
      ctaUrl: z.string(),
      campaignTag: z.string().optional(),
      eventSections: mailingEventSectionsSchema,
    })).mutation(async ({ input }) => {
      const eventInfo = Object.values(input.eventSections).some(Boolean) ? await getMailingEventInfo() : null;
      const { batchId, results } = await sendMailingBatch(input.customerIds, input.content, input.ctaUrl, input.campaignTag, eventInfo, input.eventSections, 'manual');
      return { batchId, results };
    }),
    // Cola de envío automática (pedido explícito del usuario): a diferencia
    // de sendBatch (manda ya mismo desde el navegador), esto solo guarda la
    // campaña -- el cron diario (server/cronRoutes.ts) la va drenando.
    createAutoCampaign: adminProcedure.input(z.object({
      name: z.string().min(1),
      audienceDescription: z.string(),
      customerIds: z.array(z.number()).min(1),
      content: MailingContentSchema,
      ctaUrl: z.string(),
      eventSections: mailingEventSectionsSchema,
      eventId: z.number().optional(),
    })).mutation(async ({ input }) => {
      try {
        return await createAutoMailingCampaign(input);
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo crear la campaña.' });
      }
    }),
    // Campaña PROGRAMADA: sale a `scheduledAt` (ISO) y la audiencia se resuelve recién a esa hora (quien compró
    // entremedio queda fuera). El cron la toma sola.
    scheduleCampaign: adminProcedure.input(z.object({
      name: z.string().min(1),
      audienceDescription: z.string(),
      audienceFilters: AudienceFiltersSchema,
      content: MailingContentSchema,
      ctaUrl: z.string(),
      eventSections: mailingEventSectionsSchema,
      eventId: z.number().optional(),
      scheduledAt: z.string().datetime(),
    })).mutation(async ({ input }) => {
      try {
        return await scheduleMailingCampaign({ ...input, scheduledAt: new Date(input.scheduledAt) });
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo programar la campaña.' });
      }
    }),
    // Cuántos recibirían la campaña si saliera ahora (con los mismos filtros que se resuelven a la hora de envío). Es una
    // mutación porque, con leads, deja a los leads como clientes (igual que al enviar).
    previewAudience: adminProcedure.input(AudienceFiltersSchema).mutation(async ({ input }) => {
      const ids = await resolveAudienceCustomerIds(input);
      return { count: ids.length };
    }),
    // Prueba: manda la campaña (variantes A y B del asunto) a un correo, sin tocar a ningún cliente.
    sendTest: adminProcedure.input(z.object({
      to: z.string().email(),
      content: MailingContentSchema,
      ctaUrl: z.string(),
      eventSections: mailingEventSectionsSchema,
      eventId: z.number().optional(),
    })).mutation(async ({ input }) => {
      const eventInfo = Object.values(input.eventSections).some(Boolean) ? await getMailingEventInfo() : null;
      const offer = input.content.theme ? await getCampaignOffer(input.eventId) : null;
      const html = buildMailingBlastEmail({ ...input.content, buyerName: 'Prueba', ctaUrl: input.ctaUrl, eventInfo, eventSections: input.eventSections, priceList: offer?.priceList, remaining: offer?.remaining });
      const subjects = [`[PRUEBA A] ${input.content.subject}`, ...(input.content.subjectB ? [`[PRUEBA B] ${input.content.subjectB}`] : [])];
      const results = [];
      for (const subject of subjects) results.push(await sendEmail({ to: input.to, subject, html, marketing: true }));
      return { sent: results.filter((r) => r.success).length, total: results.length };
    }),
    // Aviso de Resend por campaña y variante (entregados, aperturas, clics, rebotes, quejas) para elegir el mejor asunto.
    campaignStats: adminReadProcedure.input(z.object({ campaignName: z.string().min(1) })).query(async ({ input }) => {
      return db.getCampaignEmailStats(resendTagValue(input.campaignName));
    }),
    listCampaigns: adminReadProcedure.query(async () => {
      return db.listMailingCampaigns();
    }),
    // Contador diario de TODOS los correos (server/db.ts countEmailsSentToday)
    // -- pedido explícito del dueño para cuidar el cupo de ~100/día de
    // Resend. `dailyCap` es informativo (RESEND_DAILY_EMAIL_CAP, default
    // 1500 con Resend Pro): no bloquea nada; el límite real es mensual (50.000).
    getDailyEmailUsage: adminReadProcedure.query(async () => {
      const sentToday = await db.countEmailsSentToday();
      const dailyCap = Number(process.env.RESEND_DAILY_EMAIL_CAP) || RESEND_DAILY_DEFAULT;
      const periodStart = billingPeriodStart();
      const sentMonth = await db.countEmailsSentSince(periodStart);
      return {
        sentToday, dailyCap, remaining: Math.max(0, dailyCap - sentToday),
        sentMonth, monthlyLimit: RESEND_MONTHLY_LIMIT, periodStart: periodStart.toISOString(),
      };
    }),
    getCampaignRecipients: adminReadProcedure.input(z.object({ campaignId: z.number() })).query(async ({ input }) => {
      return db.getMailingCampaignRecipients(input.campaignId);
    }),
    // Envíos inmediatos (aviso automático de primeros cupos + "Enviar a N
    // clientes") -- log aparte de mailingCampaigns/mailingRecipients, ver
    // mailingSendLog en drizzle/schema.ts.
    listRecentSendBatches: adminReadProcedure.query(async () => {
      return db.listRecentMailingSendBatches();
    }),
    getSendBatchDetail: adminReadProcedure.input(z.object({ batchId: z.string() })).query(async ({ input }) => {
      return db.getMailingSendLogForBatch(input.batchId);
    }),
    // Frena el drenaje del cron para una campaña todavía 'sending' (pedido
    // explícito del usuario: no había forma de cancelar una programada).
    cancelCampaign: adminProcedure.input(z.object({ campaignId: z.number() })).mutation(async ({ input }) => {
      try {
        return await db.cancelMailingCampaign(input.campaignId);
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo cancelar la campaña.' });
      }
    }),

    // Aviso automático diario de "primeros cupos" (server/foundersPromo.ts,
    // pedido explícito del dueño). El on/off vive en settings.update
    // (siteSettings.foundersPromoEnabled) -- estos 3 son solo estado en
    // vivo, preview y disparo manual para probar antes de prender el cron.
    foundersPromoStatus: adminReadProcedure.query(async () => {
      return getFoundersPromoStatus();
    }),
    foundersPromoPreview: adminReadProcedure.query(async () => {
      const status = await getFoundersPromoStatus();
      if (status.remaining === null || !status.eventTitle) return { html: null, status };
      const event = await db.getFeaturedEvent();
      if (!event) return { html: null, status };
      return {
        html: buildMailingBlastEmail({
          ...buildFoundersPromoContent(status.remaining, event),
          buyerName: 'Camila',
          ctaUrl: `${EMAIL_BASE_URL}/checkout/${event.slug}`,
          eventInfo: null,
        }),
        status,
      };
    }),
    // Dispara la corrida de hoy ya mismo (para probar, o para recuperar un
    // día si el cron no llegó a correr) -- misma función que usa el cron.
    foundersPromoRunNow: adminProcedure.mutation(async () => {
      return runFoundersPromoDaily();
    }),

    // Aviso diario de la 2ª tanda (server/tanda2Promo.ts) -- mismo esquema
    // que el de primeros cupos: el on/off vive en settings.update.
    tanda2PromoStatus: adminReadProcedure.query(async () => {
      return getTanda2PromoStatus();
    }),
    tanda2PromoPreview: adminReadProcedure.query(async () => {
      const status = await getTanda2PromoStatus();
      if (status.priceFrom === null || !status.eventTitle) return { html: null, status };
      const event = await db.getFeaturedEvent();
      if (!event) return { html: null, status };
      return {
        html: buildMailingBlastEmail({
          ...buildTanda2PromoContent(status.priceFrom, event),
          buyerName: 'Camila',
          ctaUrl: `${EMAIL_BASE_URL}/checkout/${event.slug}`,
          eventInfo: null,
          priceList: status.prices,
          remaining: status.remaining,
        }),
        status,
      };
    }),
    tanda2PromoRunNow: adminProcedure.mutation(async () => {
      return runTanda2PromoDaily();
    }),

    // Aviso continuo de venta (server/salesDrip.ts): el on/off y los días de
    // espera viven en settings.update.
    salesDripStatus: adminReadProcedure.query(async () => {
      return getSalesDripStatus();
    }),
    salesDripPreview: adminReadProcedure.query(async () => {
      const status = await getSalesDripStatus();
      const event = await db.getFeaturedEvent();
      if (!event || status.priceFrom === null) return { html: null, status };
      const offer = await resolveCurrentOffer(event.id);
      if (!offer) return { html: null, status };
      return {
        html: buildMailingBlastEmail({
          ...buildSalesDripContent(event as any, offer),
          buyerName: 'Camila',
          ctaUrl: `${EMAIL_BASE_URL}/checkout/${event.slug}`,
          eventInfo: null,
          priceList: offer.prices,
          remaining: offer.remaining,
        }),
        status,
      };
    }),
    salesDripRunNow: adminProcedure.mutation(async () => {
      return runSalesDripDaily();
    }),
  }),

  // Consulta pública de saldo de Playcoins (pedido explícito del usuario) --
  // sin login, igual que referrals.getByCode: el sitio no tiene cuentas de
  // comprador, el email es lo único necesario.
  playcoins: router({
    // Ya no es una consulta abierta por correo: solo la ve su dueño (con su sesión de «Mi cuenta»),
    // la caja (operador) o un admin. Para el público, ver /cuenta.
    getBalanceByEmail: publicProcedure.input(z.object({ email: z.string().email() })).query(async ({ input, ctx }) => {
      const me = getMemberEmail(ctx.req);
      const allowed = !!ctx.operator || ctx.user?.role === 'admin' || (!!me && me === normalizeMemberEmail(input.email));
      if (!allowed) return null;
      return db.getPlaycoinsBalance(input.email);
    }),
  }),

  // Saldo prepagado en PLATA de la tarjeta de membresía (pedido explícito del
  // dueño) -- distinto e independiente de Playcoins. VER el saldo es público
  // (mismo criterio que playcoins.getBalanceByEmail); GASTARLO exige PIN, y
  // eso vive en caja.sale, no acá. Nunca en /puerta -- decisión explícita del
  // dueño: el estacionamiento se paga como extra online o en la puerta con
  // efectivo/tarjeta, nunca con saldo.
  prepaid: router({
    // Define o cambia el PIN de la tarjeta. Público a propósito: la prueba de
    // identidad es haber pagado de verdad una carga de saldo con Mercado
    // Pago (verificado adentro por orderNumber+paymentStatus), no una
    // sesión -- ver server/db.ts setCardPinAfterTopup.
    //
    // Límite por IP acá, ADEMÁS del límite por cliente que ya tiene
    // setCardPinAfterTopup para cuando se CAMBIA un PIN existente (clave
    // `cardpin:<customerId>`, ver server/db.ts): ese límite no protegía para
    // nada la primera vez que se define el PIN (cardPinHash todavía null),
    // que es la rama que este endpoint toma la mayoría de las veces -- ahí
    // la única prueba de identidad es acertar un orderNumber aprobado con
    // una carga de saldo, y antes se podía probar sin ningún freno. Mismo
    // mecanismo y misma clave (`checkIpRateLimit`/`recordIpFailedAttempt`,
    // 15 intentos / 15 min) que ya usa el login por PIN de operador acá
    // arriba (verifyOperatorPinOrThrow) -- nada nuevo que mantener. Un
    // comprador legítimo llama esto una sola vez, apenas se aprueba su pago
    // (ver Checkout.tsx), así que nunca lo nota.
    setCardPinAfterTopup: publicProcedure.input(z.object({
      orderNumber: z.string().min(1),
      pin: z.string().regex(/^\d{4}$/, 'El PIN debe tener 4 dígitos'),
      currentPin: z.string().regex(/^\d{4}$/).optional(),
    })).mutation(async ({ input, ctx }) => {
      const ipKey = `cardpin-set:${clientIp(ctx)}`;
      if (!(await db.checkIpRateLimit(ipKey))) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos -- espera unos minutos.' });
      }
      try {
        return await db.setCardPinAfterTopup(input);
      } catch (err) {
        await db.recordIpFailedAttempt(ipKey);
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo definir el PIN.' });
      }
    }),
  }),

  // Recargar la PlayCard DESPUÉS de comprar la entrada. Dos formas de
  // identificarse: el ticketCode del link de la tarjeta digital (botón "Cargar
  // saldo"), o un código de 6 dígitos que llega al correo (/recargar). El
  // cobro es el Payment Brick de siempre sobre una orden de solo carga.
  playcardTopup: router({
    // Manda el código al correo. SIEMPRE responde lo mismo, exista o no el
    // correo, para que nadie pueda averiguar quién es cliente.
    requestCode: publicProcedure.input(z.object({ email: z.string().email().max(200) })).mutation(async ({ input, ctx }) => {
      const email = normalizeEmail(input.email);
      const ipKey = `topup-send-ip:${clientIp(ctx)}`;
      const emailKey = `topup-send:${email}`;
      if (!(await db.checkIpRateLimit(ipKey)) || !(await db.checkIpRateLimit(emailKey))) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Pediste muchos códigos. Espera un rato e intenta de nuevo.' });
      }
      await db.recordIpAttempt(ipKey, 10, 60 * 60 * 1000);
      await db.recordIpAttempt(emailKey, 5, 60 * 60 * 1000);

      const identity = await identityFromEmail(email);
      if (identity) {
        const html = buildTopupCodeEmail({ code: currentLoginCode(email) });
        await sendEmail({ to: email, subject: '🔐 Tu código para recargar la PlayCard', html });
      }
      return { ok: true as const };
    }),

    // Canjea el código por una sesión corta (30 min) para recargar.
    verifyCode: publicProcedure.input(z.object({
      email: z.string().email().max(200),
      code: z.string().min(1).max(20),
    })).mutation(async ({ input, ctx }) => {
      const email = normalizeEmail(input.email);
      const emailKey = `topup-verify:${email}`;
      const ipKey = `topup-verify-ip:${clientIp(ctx)}`;
      if (!(await db.checkIpRateLimit(emailKey)) || !(await db.checkIpRateLimit(ipKey))) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Espera unos minutos y pide un código nuevo.' });
      }
      const identity = await identityFromEmail(email);
      if (!identity || !verifyLoginCode(email, input.code)) {
        await db.recordIpAttempt(emailKey, 5, 15 * 60 * 1000);
        await db.recordIpAttempt(ipKey, 20, 15 * 60 * 1000);
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Código incorrecto o vencido.' });
      }
      return { sessionToken: signTopupSession(email) };
    }),

    // "Olvidé mi PIN": manda el código de 6 dígitos al correo de la tarjeta
    // (nunca a uno que escriba el cliente) y devuelve el correo enmascarado.
    requestPinResetCode: publicProcedure.input(z.object({
      ticketCode: z.string().optional(),
      sessionToken: z.string().optional(),
      member: z.boolean().optional(),
    })).mutation(async ({ input, ctx }) => {
      const identity = await resolveTopupIdentity(input, ctx.req);
      const ipKey = `topup-send-ip:${clientIp(ctx)}`;
      const emailKey = `topup-send:${identity.email}`;
      if (!(await db.checkIpRateLimit(ipKey)) || !(await db.checkIpRateLimit(emailKey))) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Pediste muchos códigos. Espera un rato e intenta de nuevo.' });
      }
      await db.recordIpAttempt(ipKey, 10, 60 * 60 * 1000);
      await db.recordIpAttempt(emailKey, 5, 60 * 60 * 1000);
      const html = buildTopupCodeEmail({ code: currentLoginCode(identity.email), purpose: 'pin' });
      await sendEmail({ to: identity.email, subject: '🔐 Tu código para cambiar el PIN de la PlayCard', html });
      return { maskedEmail: maskEmail(identity.email) };
    }),

    // Cambia el PIN sin pedir el actual: la prueba de identidad es el código
    // que llegó al correo. Mismo límite de intentos que verifyCode.
    resetPin: publicProcedure.input(z.object({
      ticketCode: z.string().optional(),
      sessionToken: z.string().optional(),
      member: z.boolean().optional(),
      code: z.string().min(1).max(20),
      pin: z.string().regex(/^\d{4}$/, 'El PIN debe tener 4 dígitos'),
    })).mutation(async ({ input, ctx }) => {
      const identity = await resolveTopupIdentity(input, ctx.req);
      const emailKey = `topup-verify:${identity.email}`;
      const ipKey = `topup-verify-ip:${clientIp(ctx)}`;
      if (!(await db.checkIpRateLimit(emailKey)) || !(await db.checkIpRateLimit(ipKey))) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Espera unos minutos y pide un código nuevo.' });
      }
      if (!verifyLoginCode(identity.email, input.code)) {
        await db.recordIpAttempt(emailKey, 5, 15 * 60 * 1000);
        await db.recordIpAttempt(ipKey, 20, 15 * 60 * 1000);
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Código incorrecto o vencido.' });
      }
      try {
        await resetCardPin(identity, input.pin);
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo cambiar el PIN.' });
      }
      await sendEmail({
        to: identity.email,
        subject: '🔒 Cambiaste el PIN de tu PlayCard',
        html: buildPinChangedEmail({ buyerName: identity.buyerName, instagramUrl: BRAND.instagram }),
      });
      return { success: true as const };
    }),

    getOptions: publicProcedure.input(z.object({
      ticketCode: z.string().optional(),
      sessionToken: z.string().optional(),
      member: z.boolean().optional(),
    })).query(async ({ input, ctx }) => {
      const identity = await resolveTopupIdentity(input, ctx.req);
      return getTopupOptions(identity);
    }),

    create: publicProcedure.input(z.object({
      ticketCode: z.string().optional(),
      sessionToken: z.string().optional(),
      member: z.boolean().optional(),
      ticketTypeId: z.number().int().positive(),
      pin: z.string().regex(/^\d{4}$/, 'El PIN debe tener 4 dígitos').optional(),
    })).mutation(async ({ input, ctx }) => {
      const ipKey = `topup-create:${clientIp(ctx)}`;
      if (!(await db.checkIpRateLimit(ipKey))) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Espera un rato e intenta de nuevo.' });
      }
      const identity = await resolveTopupIdentity(input, ctx.req);
      await db.recordIpAttempt(ipKey, 15, 60 * 60 * 1000);
      try {
        return await createTopupOrder(identity, { ticketTypeId: input.ticketTypeId, pin: input.pin });
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo crear la recarga.' });
      }
    }),

    // Agregar estacionamiento u otros extras a la compra DESDE el ticket del
    // cliente (server/orderAddon.ts). Se identifica con el ticketCode del link,
    // igual que "Cargar saldo". La orden sale del ticket, NUNCA del cliente; el
    // cliente solo elige extra y cantidad, y el servidor revalida todo y calcula el
    // monto con el precio de la base de datos. Se paga con el link de Mercado Pago.
    getAddonOptions: publicProcedure.input(z.object({
      ticketCode: z.string().min(1).max(64),
    })).query(async ({ input }) => {
      const orderId = await orderIdFromTicketCode(input.ticketCode);
      if (!orderId) throw new TRPCError({ code: 'NOT_FOUND', message: 'No encontramos esta entrada.' });
      return customerAddonView(orderId);
    }),

    createAddon: publicProcedure.input(z.object({
      ticketCode: z.string().min(1).max(64),
      ticketTypeId: z.number().int().positive(),
      quantity: z.number().int().min(1).max(10),
    })).mutation(async ({ input, ctx }) => {
      const ipKey = `addon-create:${clientIp(ctx)}`;
      if (!(await db.checkIpRateLimit(ipKey))) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Espera un rato e intenta de nuevo.' });
      }
      const orderId = await orderIdFromTicketCode(input.ticketCode);
      if (!orderId) throw new TRPCError({ code: 'NOT_FOUND', message: 'No encontramos esta entrada.' });
      await db.recordIpAttempt(ipKey, 15, 60 * 60 * 1000);
      try {
        const { addon } = await createAddonRequest({
          orderId,
          ticketTypeId: input.ticketTypeId,
          quantity: input.quantity,
          source: 'customer',
          returnPath: `/verificar/${encodeURIComponent(input.ticketCode)}`,
        });
        if (!addon.paymentUrl) throw new Error('No se pudo crear el link de pago. Intenta de nuevo.');
        return { addonId: addon.id, amount: Number(addon.amount), paymentUrl: addon.paymentUrl };
      } catch (err) {
        // Sin pistas internas para el cliente: el mensaje de "falta migración" está
        // pensado para el admin.
        const message = err instanceof Error ? err.message : '';
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: /migraci/i.test(message) || !message ? 'Esta opción no está disponible por ahora.' : message,
        });
      }
    }),
  }),

  // Resumen de la tarjeta digital para /verificar/:ticketCode (saldo +
  // Playcoins + movimientos recientes) -- público, mismo criterio que
  // tickets.getByCode: el QR/link ya es la prueba de posesión de la entrada.
  wallet: router({
    getByTicketCode: publicProcedure.input(z.object({ ticketCode: z.string() })).query(async ({ input }) => {
      return db.getWalletForTicket(input.ticketCode);
    }),
    // Extras sin canjear de OTRAS órdenes del mismo comprador (por email) --
    // "esto te quedó pendiente de otra fiesta". Mismo criterio de acceso que
    // getByTicketCode: el link/QR de la entrada ya es la prueba de posesión.
    getPendingExtras: publicProcedure.input(z.object({ ticketCode: z.string() })).query(async ({ input }) => {
      return db.getPendingExtrasForCustomer(input.ticketCode);
    }),
  }),

  // Enrolamiento de dispositivos desde /admin (pedido explícito del usuario).
  devices: router({
    listAll: adminReadProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return db.listAllDevices(input.eventId);
    }),
    // Genera un código de un solo uso (vence a las 24h) para enrolar una
    // tablet nueva -- se muestra una sola vez en el admin, no se puede
    // recuperar después (mismo criterio que un PIN).
    create: adminProcedure.input(z.object({ eventId: z.number(), name: z.string().min(1) })).mutation(async ({ input }) => {
      const code = generateEnrollCode();
      const id = await db.createDeviceEnrollment(input.eventId, input.name, code, enrollCodeExpiry());
      return { id, enrollCode: code };
    }),
    setActive: adminProcedure.input(z.object({ id: z.number(), active: z.number().min(0).max(1) })).mutation(async ({ input }) => {
      await db.updateDeviceActive(input.id, input.active as 0 | 1);
      return { success: true } as const;
    }),
    // Ningún dispositivo queda referenciado desde otra tabla (ver
    // db.deleteDevice), así que este borrado nunca se bloquea por historial.
    delete: adminPasswordProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      try {
        const result = await db.deleteDevice(input.id);
        await db.recordAdminAudit({ action: 'devices.delete', targetType: 'device', targetId: input.id, ip: clientIp(ctx) });
        return result;
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo eliminar el dispositivo.' });
      }
    }),
  }),

  // Cajas físicas ("Caja 1", "Caja 2"...) desde /admin.
  registers: router({
    listAll: adminReadProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return db.listAllRegisters(input.eventId);
    }),
    create: adminProcedure.input(z.object({ eventId: z.number(), name: z.string().min(1) })).mutation(async ({ input }) => {
      const id = await db.createRegister(input.eventId, input.name);
      return { id };
    }),
    delete: adminPasswordProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      try {
        const result = await db.deleteRegister(input.id);
        await db.recordAdminAudit({ action: 'registers.delete', targetType: 'register', targetId: input.id, ip: clientIp(ctx) });
        return result;
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo eliminar la caja.' });
      }
    }),
  }),

  // Reportes y auditoría de /caja desde /admin (docs/ARQUITECTURA-CAJA.md §11, Fase 4).
  cajaReports: router({
    // Historial del vigilante de caja (server/caja/alerts.ts).
    alerts: adminReadProcedure.input(z.object({ eventId: z.number().optional() }).optional()).query(async ({ input }) => {
      return listCajaAlerts(input?.eventId);
    }),
    salesHistory: adminReadProcedure.input(z.object({
      eventId: z.number(),
      search: z.string().max(100).optional(),
      paymentMethod: z.enum(['efectivo', 'debito', 'credito', 'qr', 'saldo']).optional(),
      status: z.enum(['approved', 'refunded']).optional(),
      cursor: z.number().optional(),
      limit: z.number().min(1).max(100).default(30),
    })).query(async ({ input }) => {
      return db.getCajaSalesHistory(input);
    }),
    profit: adminReadProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return db.getProfitReport(input.eventId);
    }),
    // IA: preguntas simples sobre ventas/movimientos, con los datos ya
    // agregados del sistema (ver server/adminQa.ts). adminProcedure (no
    // adminReadProcedure) porque dispara una llamada a IA con costo, mismo
    // criterio que mailing/recordatorios.
    askAi: adminProcedure.input(z.object({
      question: z.string().min(3).max(500),
      eventId: z.number().optional(),
    })).mutation(async ({ input }) => {
      try {
        const answer = await answerSalesQuestion(input.question, input.eventId);
        return { answer };
      } catch (err) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err instanceof Error ? err.message : 'No se pudo generar la respuesta.' });
      }
    }),
    kitchenVendorReport: adminReadProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return db.getKitchenVendorReport(input.eventId);
    }),
    // Manda la rendición de cocina al proveedor cargado en Ajustes -- no
    // bloqueante si Resend falla, mismo criterio que shiftClose.
    sendKitchenVendorReport: adminProcedure.input(z.object({ eventId: z.number() })).mutation(async ({ input }) => {
      const settings = await db.getSiteSettings();
      if (!settings.kitchenVendorEmail) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Primero carga el email del proveedor de cocina en Ajustes.' });
      }
      const event = await db.getEventById(input.eventId);
      const eventTitle = event?.title ?? `Evento #${input.eventId}`;
      const report = await db.getKitchenVendorReport(input.eventId);
      const vendorName = settings.kitchenVendorName || 'Proveedor de cocina';

      const pdf = await buildKitchenVendorPdf({ eventTitle, vendorName, ...report });
      const html = buildKitchenVendorEmail({ eventTitle, vendorName, totalRevenue: report.totalRevenue, vendorShare: report.vendorShare, venueShare: report.venueShare });
      const attachments = [{ filename: `rendicion-cocina-${eventTitle}.pdf`, content: pdf }];
      const subject = `[Rendición de cocina] ${eventTitle}`;

      const result = await sendEmail({ to: settings.kitchenVendorEmail, cc: ADMIN_NOTIFICATION_EMAIL, subject, html, attachments });
      return { success: true, emailSent: result.success };
    }),
    // Reporte consolidado de Ventas/Gastos por sub-tab (pedido explícito del
    // usuario: un solo botón que arma PDF+CSV+email en vez de uno por
    // tabla). El admin siempre recibe copia; `recipientEmails` son los
    // emails de staff elegidos a mano en el diálogo de envío.
    emailVentasReport: adminProcedure.input(z.object({
      eventId: z.number(),
      recipientEmails: z.array(z.string().email()).default([]),
    })).mutation(async ({ input }) => {
      const event = await db.getEventById(input.eventId);
      const eventTitle = event?.title ?? `Evento #${input.eventId}`;
      const rows = await db.getProfitReport(input.eventId);
      const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
      const totalProfit = rows.reduce((s, r) => s + (r.profit ?? 0), 0);
      const pdf = await buildVentasReportPdf(eventTitle, rows);
      const html = buildSimpleReportEmail({
        title: `📈 Reporte de ventas — ${eventTitle}`,
        subtitle: `${rows.length} productos vendidos`,
        lines: [
          { label: 'Ingresos totales', value: `$${Math.round(totalRevenue).toLocaleString('es-CL')}` },
          { label: 'Utilidad total', value: `$${Math.round(totalProfit).toLocaleString('es-CL')}` },
        ],
      });
      const recipients = Array.from(new Set([ADMIN_NOTIFICATION_EMAIL, ...input.recipientEmails]));
      const attachments = [{ filename: `ventas-${eventTitle}.pdf`, content: pdf }];
      const results = await Promise.all(recipients.map((to) => sendEmail({ to, subject: `[Reporte de ventas] ${eventTitle}`, html, attachments })));
      return { success: true, emailSent: results.every((r) => r.success) };
    }),
    emailGastosReport: adminProcedure.input(z.object({
      eventId: z.number(),
      recipientEmails: z.array(z.string().email()).default([]),
    })).mutation(async ({ input }) => {
      const event = await db.getEventById(input.eventId);
      const eventTitle = event?.title ?? `Evento #${input.eventId}`;
      const rows = await db.listExpenses({ eventId: input.eventId });
      const total = rows.reduce((s: number, r: any) => s + r.amountTotal, 0);
      const pdf = await buildGastosReportPdf(eventTitle, rows as any);
      const html = buildSimpleReportEmail({
        title: `💸 Reporte de gastos — ${eventTitle}`,
        subtitle: `${rows.length} gastos registrados`,
        lines: [{ label: 'Total gastado', value: `$${Math.round(total).toLocaleString('es-CL')}` }],
      });
      const recipients = Array.from(new Set([ADMIN_NOTIFICATION_EMAIL, ...input.recipientEmails]));
      const attachments = [{ filename: `gastos-${eventTitle}.pdf`, content: pdf }];
      const results = await Promise.all(recipients.map((to) => sendEmail({ to, subject: `[Reporte de gastos] ${eventTitle}`, html, attachments })));
      return { success: true, emailSent: results.every((r) => r.success) };
    }),
    // `eventIds` opcional: sin filtro compara todos los eventos, con filtro
    // solo los seleccionados (selector de eventos del admin).
    eventComparison: adminReadProcedure.input(z.object({ eventIds: z.array(z.number()).optional() }).optional()).query(async ({ input }) => {
      return db.getEventComparison(input?.eventIds);
    }),
    // Resultado REAL de un evento: a diferencia de `profit` (que es margen por
    // producto, sobre precios de lista), acá el ingreso es la plata que entró
    // de verdad y se restan todos los gastos, el IVA y las comisiones.
    eventPnl: adminReadProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return db.getEventPnl(input.eventId);
    }),
    pnlComparison: adminReadProcedure.input(z.object({ eventIds: z.array(z.number()).optional() }).optional()).query(async ({ input }) => {
      return db.getPnlComparison(input?.eventIds);
    }),
    parkingReport: adminReadProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return db.getParkingReport(input.eventId);
    }),
    peakHours: adminReadProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return db.getPeakHours(input.eventId);
    }),
    ledger: adminReadProcedure.input(z.object({
      eventId: z.number(),
      operatorId: z.number().optional(),
      type: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    })).query(async ({ input }) => {
      const { eventId, ...filters } = input;
      return db.getLedger(eventId, filters);
    }),
    // Cuadres de caja guardados (pedido explícito del usuario) -- sin
    // eventId trae los de todos los eventos, para comparar entre fiestas.
    shiftClosings: adminReadProcedure.input(z.object({ eventId: z.number().optional() }).optional()).query(async ({ input }) => {
      return db.listShiftClosings(input?.eventId);
    }),
    // Turnos todavía abiertos: los necesita el formulario de gastos para
    // ofrecer "se pagó con plata del cajón de esta caja". Sin marcarlo, ese
    // efectivo aparece como faltante en el arqueo de esa caja.
    // Suscripciones activas (gastos que se repiten todos los meses). Hoy no
    // se ven en ningún lado del panel: se marcan al crear el gasto y después
    // generan una copia cada mes sin que nadie pueda revisarlas ni darlas de
    // baja.
    recurringExpenses: adminReadProcedure.query(async () => {
      return db.listRecurringExpenses();
    }),
    // Bitácora de acciones destructivas del panel. Los terminales ya tenían
    // el ledger `ops`; el lado admin no dejaba ningún rastro.
    adminAudit: adminReadProcedure.input(z.object({ limit: z.number().min(1).max(500).optional() }).optional()).query(async ({ input }) => {
      return db.listAdminAudit(input?.limit ?? 200);
    }),
    openShifts: adminReadProcedure.input(z.object({ eventId: z.number().optional() }).optional()).query(async ({ input }) => {
      return db.listOpenShifts(input?.eventId);
    }),
    // Detalle venta por venta de un turno: con una diferencia grande, los
    // totales por medio de pago no alcanzan para explicarla -- hay que poder
    // comparar contra el voucher de la máquina línea por línea.
    shiftSales: adminReadProcedure.input(z.object({ shiftId: z.number() })).query(async ({ input }) => {
      return db.getShiftSales(input.shiftId);
    }),
    // Eliminar un cierre de turno (pedido explícito del usuario, para sacar
    // pruebas/cierres de práctica de los reportes reales) -- doble
    // verificación: además del diálogo de confirmación en el admin, pide la
    // misma clave que auth.adminLogin.
    // Antes comparaba la clave con `!==` (sin tiempo constante) y sin
    // ningún límite de intentos. Ahora usa el mismo procedure que el resto
    // de las acciones destructivas, para que el arreglo valga en todas.
    deleteShiftClosing: adminPasswordProcedure.input(z.object({
      shiftId: z.number(),
    })).mutation(async ({ input, ctx }) => {
      const before = await db.getShiftSales(input.shiftId);
      const result = await db.deleteShiftClosing(input.shiftId);
      await db.recordAdminAudit({ action: 'cajaReports.deleteShiftClosing', targetType: 'shift', targetId: input.shiftId, payload: { salesCount: before?.sales.length ?? null }, ip: clientIp(ctx) });
      return result;
    }),
  }),
});

export type AppRouter = typeof appRouter;
