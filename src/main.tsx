import React, { useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Copy,
  Download,
  FileClock,
  Home,
  MessageCircle,
  QrCode,
  ScanLine,
  Settings,
  Share2,
  ShieldCheck,
  Send,
  Ticket,
  UserCircle2,
  UsersRound,
  X,
} from "lucide-react";
import "./index.css";
import { initialState } from "./data/mockData";
import type {
  AppState,
  Booking,
  BookingRule,
  BookingStatus,
  Exhibition,
  ExhibitionSession,
  Member,
  OperationLog,
  SessionStatus,
  ToastType,
} from "./types/domain";
import {
  activityDisplayStatus,
  bookingStatusText,
  bookingTimeStatus,
  canClientBookSession,
  canSalesBookSession,
  createBookingCode,
  displaySessionStatus,
  formatRange,
  hasActiveBookingForExhibition,
  internalBookedCount,
  isSessionBookingDeadlineReached,
  nowText,
  publicRemainingStock,
  remainingStock,
  statusText,
  validateBooking,
} from "./utils/business";

type ClientPage = "detail" | "center" | "confirm" | "success" | "my";
type AdminPage = "dashboard" | "activities" | "config" | "sessions" | "bookings" | "assist" | "logs";
type AdminRole = "operator" | "sales";
type AppMode = "client" | "admin" | "staff";

type SalesUser = {
  salesUserId: string;
  salesUserName: string;
  salesRole: string;
};

function guestNameInitial(member: Member) {
  return member.isRealNameVerified ? (member.realName || member.name) : "";
}

function bookingFormLabel(key: string, exhibition: Exhibition) {
  if (key === "guestName") return "姓名";
  return exhibition.bookingFields.find((item) => item.fieldId === key)?.label ?? key;
}

function bookingFormEntries(booking: Booking, exhibition: Exhibition, options?: { excludeGuestName?: boolean }) {
  return Object.entries(booking.formValues ?? {})
    .filter(([key, value]) => Boolean(value) && !(options?.excludeGuestName && key === "guestName"))
    .map(([key, value]) => ({ key, label: bookingFormLabel(key, exhibition), value }));
}

function bookingSourceText(source: Booking["source"]) {
  return source === "销售代客报名" ? "内部代约" : source;
}

type Toast = {
  message: string;
  type: ToastType;
};

type StaffCheckInResult =
  | {
      ok: true;
      guestName: string;
      sessionText: string;
      bookingCode: string;
      signedAt: string;
    }
  | {
      ok: false;
      reason: string;
      bookingCode?: string;
    };

function App() {
  const [state, setState] = useState<AppState>(initialState);
  const [mode, setMode] = useState<AppMode>("client");
  const [clientPage, setClientPage] = useState<ClientPage>("detail");
  const [adminPage, setAdminPage] = useState<AdminPage>("activities");
  const [adminRole, setAdminRole] = useState<AdminRole>("operator");
  const [selectedExhibitionId, setSelectedExhibitionId] = useState("EXH001");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [lastBookingId, setLastBookingId] = useState<string | null>(null);
  const [sharePosterOpen, setSharePosterOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const exhibition = state.exhibitions.find((item) => item.exhibitionId === selectedExhibitionId)!;
  const rule = state.rules.find((item) => item.exhibitionId === selectedExhibitionId)!;
  const sessions = state.sessions.filter((item) => item.exhibitionId === selectedExhibitionId);
  const selectedSession = state.sessions.find((item) => item.sessionId === selectedSessionId) ?? null;
  const lastBooking = state.bookings.find((item) => item.bookingId === lastBookingId) ?? null;
  const activeSalesUser: SalesUser = {
    salesUserId: "SALES001",
    salesUserName: "周岚",
    salesRole: "松赞销售顾问",
  };

  function createOperationLog(input: Pick<OperationLog, "objectType" | "objectId" | "objectName" | "action" | "detail">): OperationLog {
    return {
      logId: `LOG${Date.now()}${Math.floor(Math.random() * 90 + 10)}`,
      operatorRole: adminRole === "sales" ? activeSalesUser.salesRole : "运营",
      operatorName: adminRole === "sales" ? activeSalesUser.salesUserName : "运营管理员",
      createdAt: nowText(),
      ...input,
    };
  }

  function notify(message: string, type: ToastType = "info") {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 2600);
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      notify("分享链接已复制", "success");
    } catch {
      notify("当前浏览器不支持复制，请手动复制地址栏链接", "info");
    }
  }

  function savePosterImage() {
    const link = document.createElement("a");
    link.href = exhibition.sharePosterImage;
    link.download = `${exhibition.title}-分享海报.jpg`;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.click();
    notify("已触发保存海报图，真实项目可接小程序海报生成接口", "success");
  }

  async function forwardToFriend() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: exhibition.sharePosterTitle,
          text: exhibition.sharePosterDesc,
          url: window.location.href,
        });
        notify("已唤起转发给好友", "success");
        return;
      }
      await navigator.clipboard.writeText(window.location.href);
      notify("当前浏览器不支持系统分享，已复制活动链接", "info");
    } catch {
      notify("转发已取消或暂不可用", "info");
    }
  }

  function shareActivity() {
    if (!exhibition.shareEnabled) {
      notify("该活动未开放分享", "info");
      return;
    }
    setSharePosterOpen(true);
  }

  function createBookingForMember(input: {
    member: Member;
    exhibitionId: string;
    sessionId: string;
    source: Booking["source"];
    formValues?: Record<string, string>;
    salesUser?: SalesUser;
  }) {
    const targetExhibition = state.exhibitions.find((item) => item.exhibitionId === input.exhibitionId);
    const targetRule = state.rules.find((item) => item.exhibitionId === input.exhibitionId);
    const targetSession = state.sessions.find((item) => item.sessionId === input.sessionId);

    if (!targetExhibition || !targetRule || !targetSession) {
      notify("报名数据不完整，请重新选择活动和场次", "error");
      return null;
    }

    // TODO API: 真实后端应统一校验会员、销售权限、报名规则和实时库存，并返回最终报名结果。
    const validationMember =
      input.source === "销售代客报名" ? { ...input.member, isLoggedIn: true } : input.member;
    const error = validateBooking({
      member: validationMember,
      exhibition: targetExhibition,
      rule: targetRule,
      session: targetSession,
      bookings: state.bookings,
      noticeAccepted: true,
      channel: input.source === "销售代客报名" ? "sales" : "client",
    });
    if (error) {
      notify(error, "error");
      return null;
    }

    const createdAt = nowText();
    const booking: Booking = {
      bookingId: `BKG${Date.now()}`,
      bookingCode: createBookingCode(),
      exhibitionId: targetExhibition.exhibitionId,
      sessionId: targetSession.sessionId,
      memberId: input.member.memberId,
      memberName: String(input.formValues?.guestName || input.member.realName || input.member.name),
      memberPhone: input.member.phone,
      memberLevel: input.member.level,
      bookingCount: 1,
      status: "pending_checkin",
      source: input.source,
      createdAt,
      formValues: input.formValues,
      salesUserId: input.salesUser?.salesUserId,
      salesUserName: input.salesUser?.salesUserName,
      salesRole: input.salesUser?.salesRole,
      assistedAt: input.salesUser ? createdAt : undefined,
    };

    setState((current) => ({
      ...current,
      sessions: current.sessions.map((session) =>
        session.sessionId === targetSession.sessionId
          ? { ...session, bookedCount: Math.min(session.bookedCount + 1, session.totalStock) }
          : session,
      ),
      bookings: [booking, ...current.bookings],
    }));
    setLastBookingId(booking.bookingId);
    return booking;
  }

function submitBooking(noticeAccepted: boolean, formValues: Record<string, string>) {
    if (!selectedSession) return;
    if (!noticeAccepted) {
      notify("请先勾选并确认报名须知", "error");
      return;
    }
    const missingFields = missingRequiredBookingFields(exhibition, formValues);
    if (missingFields.length > 0) {
      notify(`请填写必填信息：${missingFields.join("、")}`, "error");
      return;
    }

    const booking = createBookingForMember({
      member: state.member,
      exhibitionId: exhibition.exhibitionId,
      sessionId: selectedSession.sessionId,
      source: "小程序",
      formValues,
    });
    if (!booking) return;
    setClientPage("success");
    notify("报名成功，已生成入场凭证", "success");
  }

  function cancelBooking(bookingId: string) {
    const booking = state.bookings.find((item) => item.bookingId === bookingId);
    if (!booking) return;
    const matchedRule = state.rules.find((item) => item.exhibitionId === booking.exhibitionId);
    if (!matchedRule?.allowCancel) {
      notify("该活动不允许取消报名", "error");
      return;
    }
    if (booking.status !== "pending_checkin") {
      notify("只有待签到报名可以取消", "error");
      return;
    }
    // TODO API: 调用取消报名接口，由后端释放库存并返回最新场次库存。
    setState((current) => ({
      ...current,
      bookings: current.bookings.map((item) =>
        item.bookingId === bookingId ? { ...item, status: "cancelled", cancelledAt: nowText() } : item,
      ),
      sessions: current.sessions.map((session) =>
        session.sessionId === booking.sessionId
          ? { ...session, bookedCount: Math.max(session.bookedCount - booking.bookingCount, 0) }
          : session,
      ),
    }));
    notify("报名已取消，库存已释放", "success");
  }

  function checkInBooking(bookingId: string) {
    const booking = state.bookings.find((item) => item.bookingId === bookingId);
    const result = booking ? checkInBookingByCode(booking.bookingCode) : { ok: false, reason: "未找到该报名记录" };
    if (!result.ok) {
      notify(`签到失败，${result.reason}`, "error");
      return;
    }
    notify("已模拟签到该报名", "success");
  }

  function checkInBookingByCode(bookingCode: string): StaffCheckInResult {
    const code = bookingCode.trim();
    const booking = state.bookings.find((item) => item.bookingCode === code);
    if (!booking) return { ok: false, reason: "未找到该报名凭证", bookingCode: code };

    const targetExhibition = state.exhibitions.find((item) => item.exhibitionId === booking.exhibitionId);
    const targetSession = state.sessions.find((item) => item.sessionId === booking.sessionId);
    if (!targetExhibition || !targetSession) {
      return { ok: false, reason: "报名数据不完整", bookingCode: booking.bookingCode };
    }
    if (targetExhibition.status === "closed") {
      return { ok: false, reason: "活动已取消", bookingCode: booking.bookingCode };
    }
    if (targetExhibition.status !== "published") {
      return { ok: false, reason: "活动未上架，不可签到", bookingCode: booking.bookingCode };
    }
    if (booking.status === "checked_in") {
      return { ok: false, reason: "该客人已签到", bookingCode: booking.bookingCode };
    }
    if (booking.status === "cancelled") {
      return { ok: false, reason: "该报名已取消", bookingCode: booking.bookingCode };
    }
    if (booking.status === "expired") {
      return { ok: false, reason: "该报名已过期", bookingCode: booking.bookingCode };
    }
    if (targetSession.status === "pending") {
      return { ok: false, reason: "签到场次未开放", bookingCode: booking.bookingCode };
    }
    if (targetSession.status === "ended") {
      return { ok: false, reason: "签到场次已结束", bookingCode: booking.bookingCode };
    }
    if (targetSession.status === "closed") {
      return { ok: false, reason: "签到场次已取消", bookingCode: booking.bookingCode };
    }

    // TODO API: 员工端扫码签到应调用签到接口，后端校验报名码、活动、场次和员工权限后返回签到结果。
    const signedAt = nowText();
    setState((current) => ({
      ...current,
      bookings: current.bookings.map((booking) =>
        booking.bookingCode === code && booking.status === "pending_checkin"
          ? { ...booking, status: "checked_in", checkedInAt: signedAt, signedInAt: signedAt, signInSource: "现场二维码" }
          : booking,
      ),
    }));
    return {
      ok: true,
      guestName: booking.memberName,
      sessionText: `${targetSession.sessionName} · ${formatRange(targetSession.startTime, targetSession.endTime)}`,
      bookingCode: booking.bookingCode,
      signedAt,
    };
  }

  function updateExhibition(next: Exhibition) {
    // TODO API: 保存 B 端活动配置。
    const log = createOperationLog({
      objectType: "活动",
      objectId: next.exhibitionId,
      objectName: next.title,
      action: "保存活动配置",
      detail: `保存活动基础信息、分享设置、短信文案和报名字段。活动状态：${next.status === "published" ? "已上架" : next.status === "closed" ? "已取消" : "下架"}`,
    });
    setState((current) => ({
      ...current,
      exhibitions: current.exhibitions.map((item) =>
        item.exhibitionId === next.exhibitionId ? next : item,
      ),
      operationLogs: [log, ...current.operationLogs],
    }));
    notify("活动配置已保存，C 端展示已同步", "success");
  }

  function addExhibition() {
    const exhibitionId = `EXH${Date.now()}`;
    const nextExhibition: Exhibition = {
      exhibitionId,
      title: "未命名活动",
      coverImage:
        "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
      sharePosterImage:
        "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
      sharePosterTitle: "未命名活动",
      sharePosterDesc: "扫码进入松赞小程序查看活动详情。",
      description: "请填写活动简介。",
      detailedDescription: "请填写活动详细介绍。",
      successSmsTemplate: "【松赞】您已成功报名「未命名活动」，请按所选场次到场，并在小程序个人中心出示报名凭证。",
      location: "请填写活动地点",
      exhibitionStartTime: "2026-09-01 10:00",
      exhibitionEndTime: "2026-09-01 18:00",
      bookingStartTime: "2026-08-01 10:00",
      bookingEndTime: "2026-08-31 18:00",
      notice: "请按报名场次提前到场，报名凭证仅限本人使用。",
      bookingFields: [
        { fieldId: `withChildren_${Date.now()}`, label: "是否带儿童", required: true },
        { fieldId: `childrenCount_${Date.now()}`, label: "儿童人数", required: false },
        { fieldId: `childrenAge_${Date.now()}`, label: "儿童年龄", required: false },
      ],
      visibleInMiniProgram: true,
      shareEnabled: true,
      status: "draft",
    };
    const nextRule: BookingRule = {
      exhibitionId,
      loginRequired: true,
      selfOnly: true,
      fixedBookingCount: 1,
      oneSessionPerMember: true,
      allowCancel: true,
      cancelDeadlineHours: 2,
    };

    // TODO API: 新增活动应提交到后端，由后端返回活动 ID 和默认报名规则。
    const log = createOperationLog({
      objectType: "活动",
      objectId: exhibitionId,
      objectName: nextExhibition.title,
      action: "新增活动",
      detail: "新增活动并生成默认报名规则",
    });
    setState((current) => ({
      ...current,
      exhibitions: [nextExhibition, ...current.exhibitions],
      rules: [nextRule, ...current.rules],
      operationLogs: [log, ...current.operationLogs],
    }));
    setSelectedExhibitionId(exhibitionId);
    setAdminPage("config");
    notify("已新增活动，请继续完善配置", "success");
  }

  function cancelExhibition(exhibitionId: string) {
    const target = state.exhibitions.find((item) => item.exhibitionId === exhibitionId);
    if (!target) return;
    if (target.status === "closed") {
      notify("该活动已取消", "info");
      return;
    }
    const cancelledAt = nowText();

    // TODO API: 官方原因取消活动应调用活动取消接口，由后端锁定活动并批量取消报名记录。
    const log = createOperationLog({
      objectType: "活动",
      objectId: target.exhibitionId,
      objectName: target.title,
      action: "取消活动",
      detail: "由于官方原因取消活动，并将活动下未取消报名批量置为已取消",
    });
    setState((current) => ({
      ...current,
      exhibitions: current.exhibitions.map((item) =>
        item.exhibitionId === exhibitionId ? { ...item, status: "closed" } : item,
      ),
      bookings: current.bookings.map((booking) =>
        booking.exhibitionId === exhibitionId && booking.status !== "cancelled"
          ? { ...booking, status: "cancelled", cancelledAt }
          : booking,
      ),
      operationLogs: [log, ...current.operationLogs],
    }));
    notify("活动已取消，相关报名状态已批量更新为已取消", "success");
  }

  function updateRule(next: BookingRule) {
    // TODO API: 保存 B 端报名规则配置。
    const target = state.exhibitions.find((item) => item.exhibitionId === next.exhibitionId);
    const log = createOperationLog({
      objectType: "活动",
      objectId: next.exhibitionId,
      objectName: target?.title ?? next.exhibitionId,
      action: "保存报名规则",
      detail: `每会员限约一场：${next.oneSessionPerMember ? "是" : "否"}；允许取消：${next.allowCancel ? "是" : "否"}；取消截止：活动开始前 ${next.cancelDeadlineHours} 小时`,
    });
    setState((current) => ({
      ...current,
      rules: current.rules.map((item) => (item.exhibitionId === next.exhibitionId ? next : item)),
      operationLogs: [log, ...current.operationLogs],
    }));
    notify("报名规则已保存，C 端校验已同步", "success");
  }

  function updateSession(next: ExhibitionSession) {
    // TODO API: 保存场次信息和库存配置，并从后端读取最新库存。
    const normalized = {
      ...next,
      bookingCloseHours: Math.max(next.bookingCloseHours ?? 12, 0),
      bookedCount: Math.min(next.bookedCount, next.totalStock),
    };
    const log = createOperationLog({
      objectType: "场次",
      objectId: normalized.sessionId,
      objectName: normalized.sessionName,
      action: "保存场次",
      detail: `时间：${formatRange(normalized.startTime, normalized.endTime)}；总库存：${normalized.totalStock}；场次开始前 ${normalized.bookingCloseHours} 小时截止报名`,
    });
    setState((current) => ({
      ...current,
      sessions: current.sessions.map((item) => (item.sessionId === next.sessionId ? normalized : item)),
      operationLogs: [log, ...current.operationLogs],
    }));
    notify("场次已更新，库存展示已同步", "success");
  }

  function cancelSession(sessionId: string) {
    const target = state.sessions.find((item) => item.sessionId === sessionId);
    if (!target) return;
    const cancelledAt = nowText();
    // TODO API: 取消场次应由后端锁定场次，并批量取消该场次下未核销报名。
    const log = createOperationLog({
      objectType: "场次",
      objectId: target.sessionId,
      objectName: target.sessionName,
      action: "取消场次",
      detail: `取消场次 ${formatRange(target.startTime, target.endTime)}，并将该场次未取消报名批量置为已取消`,
    });
    setState((current) => ({
      ...current,
      sessions: current.sessions.map((session) =>
        session.sessionId === sessionId ? { ...session, status: "closed" } : session,
      ),
      bookings: current.bookings.map((booking) =>
        booking.sessionId === sessionId && booking.status !== "cancelled"
          ? { ...booking, status: "cancelled", cancelledAt }
          : booking,
      ),
      operationLogs: [log, ...current.operationLogs],
    }));
    notify("场次已取消，相关报名已批量更新为已取消", "success");
  }

  function addSession(next: ExhibitionSession) {
    // TODO API: 新增场次应提交到后端，由后端返回场次 ID、库存和初始状态。
    const log = createOperationLog({
      objectType: "场次",
      objectId: next.sessionId,
      objectName: next.sessionName,
      action: "新增场次",
      detail: `新增场次 ${formatRange(next.startTime, next.endTime)}；总库存：${next.totalStock}`,
    });
    setState((current) => ({ ...current, sessions: [...current.sessions, next], operationLogs: [log, ...current.operationLogs] }));
    notify("已新增场次", "success");
  }

  function assistBooking(member: Member, exhibitionId: string, sessionId: string, formValues: Record<string, string>) {
    const booking = createBookingForMember({
      member,
      exhibitionId,
      sessionId,
      source: "销售代客报名",
      formValues,
      salesUser: activeSalesUser,
    });
    if (!booking) return false;
    notify(`已为 ${member.name} 完成代客报名`, "success");
    return true;
  }

  return (
    <div className="min-h-screen">
      <TopNav mode={mode} setMode={setMode} />
      <main className="mx-auto w-full max-w-[1920px] px-4 py-6 xl:px-8">
        {mode === "client" ? (
          <ClientShell
            state={state}
            exhibition={exhibition}
            rule={rule}
            sessions={sessions}
            selectedSession={selectedSession}
            lastBooking={lastBooking}
            page={clientPage}
            setPage={setClientPage}
            selectSession={(sessionId) => {
              if (rule.loginRequired && !state.member.isLoggedIn) {
                notify("请先登录会员账号后再报名", "error");
                return;
              }
              const session = state.sessions.find((item) => item.sessionId === sessionId);
              if (!session) return;
              setSelectedSessionId(sessionId);
            }}
            submitBooking={submitBooking}
            cancelBooking={cancelBooking}
            shareActivity={shareActivity}
          />
        ) : mode === "staff" ? (
          <StaffShell
            state={state}
            checkInBookingByCode={checkInBookingByCode}
          />
        ) : (
          <AdminShell
            state={state}
            adminRole={adminRole}
            setAdminRole={setAdminRole}
            salesUser={activeSalesUser}
            selectedExhibitionId={selectedExhibitionId}
            setSelectedExhibitionId={setSelectedExhibitionId}
            page={adminPage}
            setPage={setAdminPage}
            addExhibition={addExhibition}
            cancelExhibition={cancelExhibition}
            updateExhibition={updateExhibition}
            updateRule={updateRule}
            updateSession={updateSession}
            addSession={addSession}
            cancelSession={cancelSession}
            cancelBooking={cancelBooking}
            checkInBooking={checkInBooking}
            assistBooking={assistBooking}
          />
        )}
      </main>
      {sharePosterOpen && (
        <SharePosterSheet
          exhibition={exhibition}
          onClose={() => setSharePosterOpen(false)}
          copyShareLink={copyShareLink}
          savePosterImage={savePosterImage}
          forwardToFriend={forwardToFriend}
        />
      )}
      {toast && <ToastView toast={toast} />}
    </div>
  );
}

function TopNav({
  mode,
  setMode,
}: {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
}) {
  const tabs: Array<{ key: AppMode; label: string }> = [
    { key: "client", label: "C 端小程序" },
    { key: "staff", label: "员工端" },
    { key: "admin", label: "B 端后台" },
  ];

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1920px] items-center justify-between px-4 py-3 xl:px-8">
        <div>
          <div className="text-sm text-slate-500">Demo</div>
          <h1 className="text-lg font-semibold text-slate-950">线下活动报名</h1>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`rounded-md px-4 py-2 text-sm font-medium ${mode === tab.key ? "bg-slate-950 text-white shadow-sm" : "text-slate-600"}`}
              onClick={() => setMode(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

function ClientShell(props: {
  state: AppState;
  exhibition: Exhibition;
  rule: BookingRule;
  sessions: ExhibitionSession[];
  selectedSession: ExhibitionSession | null;
  lastBooking: Booking | null;
  page: ClientPage;
  setPage: (page: ClientPage) => void;
  selectSession: (sessionId: string) => void;
  submitBooking: (noticeAccepted: boolean, formValues: Record<string, string>) => void;
  cancelBooking: (bookingId: string) => void;
  shareActivity: () => void;
}) {
  const myBookings = props.state.bookings.filter(
    (booking) => booking.memberId === props.state.member.memberId,
  );

  return (
    <div className="relative mx-auto max-w-[430px] overflow-hidden rounded-[28px] border border-slate-200 bg-slate-100 shadow-xl">
      <div className="flex items-center justify-between bg-slate-950 px-5 py-3 text-white">
        <span className="text-sm">松赞小程序</span>
      </div>
      <div className="min-h-[760px] bg-[#f7f8fa] pb-20">
        {props.page === "detail" && (
          <ClientBookingHome
            exhibition={props.exhibition}
            rule={props.rule}
            sessions={props.sessions}
            bookings={props.state.bookings}
            selectSession={props.selectSession}
            selectedSession={props.selectedSession}
            setPage={props.setPage}
            shareActivity={props.shareActivity}
          />
        )}
        {props.page === "center" && (
          <MiniProgramCenter
            member={props.state.member}
            bookings={myBookings}
            setPage={props.setPage}
            exhibitions={props.state.exhibitions}
            sessions={props.state.sessions}
          />
        )}
        {props.page === "confirm" && props.selectedSession && (
          <ConfirmBooking
            member={props.state.member}
            exhibition={props.exhibition}
            session={props.selectedSession}
            submitBooking={props.submitBooking}
          />
        )}
        {props.page === "success" && props.lastBooking && (
          <SuccessPage
            booking={props.lastBooking}
            exhibition={props.exhibition}
            session={props.sessions.find((item) => item.sessionId === props.lastBooking?.sessionId)!}
            setPage={props.setPage}
          />
        )}
        {props.page === "my" && (
          <MyBookings
            bookings={myBookings}
            exhibitions={props.state.exhibitions}
            sessions={props.state.sessions}
            cancelBooking={props.cancelBooking}
          />
        )}
        <ClientBottomTabs page={props.page} setPage={props.setPage} />
      </div>
    </div>
  );
}

function ClientBottomTabs({ page, setPage }: { page: ClientPage; setPage: (page: ClientPage) => void }) {
  const tabs: Array<{ key: ClientPage; label: string; icon: React.ElementType }> = [
    { key: "detail", label: "活动报名demo页", icon: Home },
    { key: "center", label: "小程序个人中心", icon: UserCircle2 },
  ];
  return (
    <div className="absolute bottom-0 left-0 right-0 grid grid-cols-2 border-t border-slate-200 bg-white">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          className={`flex min-h-16 flex-col items-center justify-center gap-1 px-2 text-xs font-medium ${page === tab.key ? "text-slate-950" : "text-slate-500"}`}
          onClick={() => setPage(tab.key)}
        >
          <tab.icon size={18} />
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function SharePosterSheet({
  exhibition,
  onClose,
  copyShareLink,
  savePosterImage,
  forwardToFriend,
}: {
  exhibition: Exhibition;
  onClose: () => void;
  copyShareLink: () => void;
  savePosterImage: () => void;
  forwardToFriend: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/50 px-4 pb-4">
      <section className="w-full max-w-[398px] rounded-3xl bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-950">小程序分享海报</div>
          <button onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-hidden rounded-2xl bg-slate-950 text-white">
          <img src={exhibition.sharePosterImage} alt={exhibition.sharePosterTitle} className="h-56 w-full object-cover" />
          <div className="p-4">
            <div className="text-xl font-semibold">{exhibition.sharePosterTitle}</div>
            <p className="mt-2 text-sm leading-6 text-slate-300">{exhibition.sharePosterDesc}</p>
            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white p-3 text-slate-950">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-slate-300">
                <QrCode size={44} className="text-slate-500" />
              </div>
              <div className="text-sm">
                <div className="font-semibold">扫码查看活动</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">二维码为 Demo 占位，真实项目接小程序码接口。</div>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <button
            onClick={savePosterImage}
            className="flex h-11 items-center justify-center gap-1 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700"
          >
            <Download size={15} />
            保存海报
          </button>
          <button
            onClick={forwardToFriend}
            className="flex h-11 items-center justify-center gap-1 rounded-xl bg-slate-950 text-xs font-semibold text-white"
          >
            <Send size={15} />
            转发好友
          </button>
          <button
            onClick={copyShareLink}
            className="h-11 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700"
          >
            复制链接
          </button>
        </div>
      </section>
    </div>
  );
}

function MiniProgramCenter(props: {
  member: AppState["member"];
  bookings: Booking[];
  exhibitions: Exhibition[];
  sessions: ExhibitionSession[];
  setPage: (page: ClientPage) => void;
}) {
  const [voucherOpen, setVoucherOpen] = useState(false);
  const demoToday = "2026-06-04";
  const todayBooking = props.bookings.find((booking) => {
    const session = props.sessions.find((item) => item.sessionId === booking.sessionId);
    return (booking.status === "pending_checkin" || booking.status === "checked_in") && session?.startTime.startsWith(demoToday);
  });
  const todayExhibition = todayBooking
    ? props.exhibitions.find((item) => item.exhibitionId === todayBooking.exhibitionId)
    : null;
  const todaySession = todayBooking
    ? props.sessions.find((item) => item.sessionId === todayBooking.sessionId)
    : null;

  return (
    <div className="space-y-4 p-4">
      <section className="rounded-2xl bg-slate-950 p-5 text-white shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm text-slate-300">松赞会员</div>
            <h2 className="mt-2 text-xl font-semibold">{props.member.name}</h2>
            <p className="mt-1 text-sm text-slate-300">{props.member.level} · {props.member.memberId}</p>
          </div>
          <UserCircle2 size={42} className="text-slate-300" />
        </div>
      </section>

      {todayBooking && todayExhibition && todaySession && (
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-950">今日活动凭证</div>
              <div className="mt-1 text-xs text-slate-500">{formatRange(todaySession.startTime, todaySession.endTime)}</div>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              {bookingStatusText(todayBooking.status)}
            </span>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{todayExhibition.title}</div>
          <button
            onClick={() => setVoucherOpen(true)}
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-semibold text-white"
          >
            <QrCode size={16} />
            查看报名凭证二维码
          </button>
        </section>
      )}

      <section className="rounded-2xl bg-white p-2 shadow-sm">
        <CenterMenuItem
          icon={<Ticket size={18} />}
          title="我的活动"
          desc="查看报名凭证、取消报名和签到状态"
          onClick={() => props.setPage("my")}
        />
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-950">Demo 说明</div>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          本页模拟松赞小程序个人中心。会员报名后在这里出示活动凭证，到场后由员工端扫描客人手机里的报名凭证完成签到。
        </p>
      </section>
      {voucherOpen && todayBooking && todayExhibition && todaySession && (
        <BookingVoucherModal
          booking={todayBooking}
          exhibition={todayExhibition}
          session={todaySession}
          onClose={() => setVoucherOpen(false)}
        />
      )}
    </div>
  );
}

function CenterMenuItem({
  icon,
  title,
  desc,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-xl px-3 py-4 text-left hover:bg-slate-50">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-950">{title}</span>
        <span className="mt-0.5 block text-xs text-slate-500">{desc}</span>
      </span>
      <ChevronRight size={18} className="text-slate-300" />
    </button>
  );
}

function ClientBookingHome(props: {
  exhibition: Exhibition;
  rule: BookingRule;
  sessions: ExhibitionSession[];
  bookings: Booking[];
  selectSession: (sessionId: string) => void;
  selectedSession: ExhibitionSession | null;
  setPage: (page: ClientPage) => void;
  shareActivity: () => void;
}) {
  const bookingDates = useMemo(() => getSessionDates(props.sessions), [props.sessions]);
  const [selectedDate, setSelectedDate] = useState(bookingDates[0] ?? "");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const selectedSessions = props.sessions.filter((session) => datePart(session.startTime) === selectedDate);
  const hasAnySession = props.sessions.length > 0;
  const currentBookingTimeStatus = bookingTimeStatus(props.exhibition);
  const canSubmitByBookingTime = currentBookingTimeStatus === "open";

  React.useEffect(() => {
    if (!bookingDates.includes(selectedDate)) {
      setSelectedDate(bookingDates[0] ?? "");
    }
  }, [bookingDates, selectedDate]);

  const selectedVisibleSession =
    props.selectedSession && datePart(props.selectedSession.startTime) === selectedDate
      ? props.selectedSession
      : null;
  const selectedStatus = selectedVisibleSession
    ? displaySessionStatus(selectedVisibleSession, props.bookings, "client")
    : null;
  const selectedDeadlineReached = selectedVisibleSession ? isSessionBookingDeadlineReached(selectedVisibleSession) : false;
  const selectedCanBook = canSubmitByBookingTime && selectedVisibleSession
    ? canClientBookSession(selectedVisibleSession, props.bookings)
    : false;
  const submitButtonText = !hasAnySession
    ? "暂无可报名场次"
    : currentBookingTimeStatus === "pending"
    ? "报名暂未开始"
    : currentBookingTimeStatus === "ended"
      ? "报名已结束"
      : !selectedVisibleSession
    ? "请选择场次"
    : selectedDeadlineReached
      ? "该场次报名已截止"
    : selectedStatus === "full"
      ? "该场次已约满"
      : selectedStatus === "ended"
        ? "该场次已结束"
        : selectedStatus === "pending"
          ? "该场次未开放"
          : "去报名";

  return (
    <div className="space-y-4 p-4">
      <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="relative">
        <img
          src={props.exhibition.coverImage}
          alt={props.exhibition.title}
          className="h-48 w-full object-cover"
        />
          <button
            onClick={props.shareActivity}
            hidden={!props.exhibition.shareEnabled}
            className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-slate-950 shadow-md backdrop-blur"
            title="分享活动"
            aria-label="分享活动"
          >
            <Share2 size={18} />
          </button>
        </div>
        <div className="p-4">
          <div className="mb-2 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            {activityDisplayStatus(props.exhibition)}
          </div>
          <h2 className="text-2xl font-semibold leading-tight text-slate-950">{props.exhibition.title}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">{props.exhibition.description}</p>
          <InfoRow label="活动地点" value={props.exhibition.location} />
          <InfoRow
            label="活动时间"
            value={formatRange(props.exhibition.exhibitionStartTime, props.exhibition.exhibitionEndTime)}
          />
          <InfoRow
            label="报名时间"
            value={formatRange(props.exhibition.bookingStartTime, props.exhibition.bookingEndTime)}
          />
        </div>
      </section>

      {!hasAnySession ? (
        <section className="rounded-2xl bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          暂无可报名场次
        </section>
      ) : (
      <>
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <CalendarDays size={18} />
            选择报名日期
          </div>
          <button
            onClick={() => setCalendarOpen(true)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700"
          >
            查看更多
          </button>
        </div>
        <div className="scrollbar-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {bookingDates.map((date) => (
            <DateChip
              key={date}
              date={date}
              active={selectedDate === date}
              sessions={props.sessions.filter((session) => datePart(session.startTime) === date)}
              bookings={props.bookings}
              onClick={() => setSelectedDate(date)}
            />
          ))}
        </div>
        {calendarOpen && (
          <CalendarSheet
            dates={bookingDates}
            selectedDate={selectedDate}
            sessions={props.sessions}
            bookings={props.bookings}
            onClose={() => setCalendarOpen(false)}
            onSelect={(date) => {
              setSelectedDate(date);
              setCalendarOpen(false);
            }}
          />
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-950">{selectedDate ? `${formatDateLabel(selectedDate)} 场次` : "报名场次"}</h3>
          <span className="text-xs text-slate-500">库存实时联动后台</span>
        </div>
        {selectedSessions.length === 0 ? (
          <div className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">当日暂无可展示场次</div>
        ) : (
          <div className="space-y-3">
            {selectedSessions.map((session) => (
              <SessionCard
                key={session.sessionId}
                session={session}
                bookings={props.bookings}
                selected={selectedVisibleSession?.sessionId === session.sessionId}
                selectSession={props.selectSession}
              />
            ))}
          </div>
        )}
      </section>
      </>
      )}

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-2 text-sm font-semibold text-slate-950">活动详细介绍</div>
        <p className="text-sm leading-6 text-slate-600">{props.exhibition.detailedDescription}</p>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-950">
          <ShieldCheck size={18} />
          具体活动规则
        </div>
        <p className="text-sm leading-6 text-slate-600">{props.exhibition.notice}</p>
      </section>

      <div className="sticky bottom-0 -mx-4 bg-white/90 p-4 backdrop-blur">
        <button
          disabled={!selectedCanBook}
          onClick={() => {
            if (!selectedCanBook) return;
            props.setPage("confirm");
          }}
          className={`flex h-12 w-full items-center justify-center rounded-xl text-sm font-semibold ${
            selectedCanBook ? "bg-slate-950 text-white" : "bg-slate-200 text-slate-500"
          }`}
        >
          {submitButtonText}
        </button>
      </div>
      <button
        onClick={() => window.alert("已唤起客服入口。真实项目可接小程序客服或企微客服。")}
        className="fixed bottom-24 right-[calc(50%-206px)] z-20 flex h-12 w-12 items-center justify-center rounded-full bg-slate-950 text-white shadow-lg"
        title="联系客服"
        aria-label="联系客服"
      >
        <MessageCircle size={22} />
      </button>
    </div>
  );
}

function SessionCard({
  session,
  bookings,
  selected,
  selectSession,
}: {
  session: ExhibitionSession;
  bookings: Booking[];
  selected: boolean;
  selectSession: (sessionId: string) => void;
}) {
  const displayStatus = displaySessionStatus(session, bookings, "client");
  const unavailable = !canClientBookSession(session, bookings);
  const active = selected && !unavailable;
  const remain = publicRemainingStock(session, bookings);
  return (
    <button
      onClick={() => selectSession(session.sessionId)}
      className={`w-full rounded-2xl border p-4 text-left transition ${
        active
          ? "border-slate-950 bg-slate-950 text-white shadow-sm"
          : unavailable
            ? `border-slate-200 bg-slate-50 opacity-60 ${selected ? "ring-2 ring-slate-300" : ""}`
            : "border-slate-950 bg-white hover:-translate-y-0.5"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={`text-sm font-semibold ${active ? "text-white" : "text-slate-950"}`}>{session.sessionName}</div>
          <div className={`mt-1 text-sm ${active ? "text-slate-300" : "text-slate-600"}`}>
            {timePart(session.startTime)} - {timePart(session.endTime)}
          </div>
        </div>
        <StatusPill status={displayStatus} />
      </div>
      <div className={`mt-4 grid grid-cols-3 rounded-xl p-3 text-center text-xs ${active ? "bg-white/10" : "bg-slate-50"}`}>
        <div className="col-span-3">
          <div className={`text-2xl font-semibold ${active ? "text-white" : "text-slate-950"}`}>{remain}</div>
          <div className={`mt-1 ${active ? "text-slate-300" : "text-slate-500"}`}>剩余名额</div>
        </div>
      </div>
    </button>
  );
}

function DateChip({
  date,
  active,
  sessions,
  bookings,
  onClick,
}: {
  date: string;
  active: boolean;
  sessions: ExhibitionSession[];
  bookings: Booking[];
  onClick: () => void;
}) {
  const openCount = sessions.filter((session) => canClientBookSession(session, bookings)).length;
  const remain = sessions.reduce((sum, session) => sum + publicRemainingStock(session, bookings), 0);
  return (
    <button
      onClick={onClick}
      className={`min-w-[88px] rounded-xl border px-3 py-2 text-left ${active ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-slate-50 text-slate-700"}`}
    >
      <div className="text-xs opacity-75">{weekdayLabel(date)}</div>
      <div className="mt-1 text-lg font-semibold">{date.slice(5).replace("-", "/")}</div>
      <div className="mt-1 text-[11px] opacity-75">{openCount} 场可约 · 余 {remain}</div>
    </button>
  );
}

function CalendarSheet({
  dates,
  selectedDate,
  sessions,
  bookings,
  onSelect,
  onClose,
}: {
  dates: string[];
  selectedDate: string;
  sessions: ExhibitionSession[];
  bookings: Booking[];
  onSelect: (date: string) => void;
  onClose: () => void;
}) {
  const baseDate = selectedDate || dates[0] || datePart(new Date().toISOString());
  const days = buildCalendarDays(baseDate);
  const dateSet = new Set(dates);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/40 px-4 pb-4">
      <section className="w-full max-w-[398px] rounded-2xl bg-white p-4 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-950">选择报名日期</div>
            <div className="mt-1 text-xs text-slate-500">{baseDate.slice(0, 7).replace("-", " 年 ")} 月</div>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500">
            <X size={16} />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-400">
          {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
            <div key={day} className="py-1">{day}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {days.map((day, index) => {
            if (!day) return <div key={`empty-${index}`} className="h-12" />;
            const enabled = dateSet.has(day);
            const daySessions = sessions.filter((session) => datePart(session.startTime) === day);
            const remain = daySessions.reduce((sum, session) => sum + publicRemainingStock(session, bookings), 0);
            return (
              <button
                key={day}
                disabled={!enabled}
                onClick={() => onSelect(day)}
                className={`h-12 rounded-xl text-xs ${selectedDate === day ? "bg-slate-950 text-white" : enabled ? "bg-slate-50 text-slate-800" : "text-slate-300"}`}
              >
                <div className="font-semibold">{Number(day.slice(8))}</div>
                {enabled && <div className="mt-0.5 text-[10px] opacity-75">余 {remain}</div>}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">只有配置了报名场次的日期可以点击，点击后会展示当日场次与实时剩余库存。</p>
      </section>
    </div>
  );
}

function getSessionDates(sessions: ExhibitionSession[]) {
  return Array.from(new Set(sessions.map((session) => datePart(session.startTime)))).sort();
}

function datePart(value: string) {
  return value.slice(0, 10);
}

function timePart(value: string) {
  return value.slice(11, 16);
}

function composeDateTime(date: string, time: string) {
  return `${date} ${time}`;
}

function missingRequiredBookingFields(exhibition: Exhibition, formValues: Record<string, string>) {
  const missingFields = exhibition.bookingFields
    .filter((field) => field.required && !String(formValues[field.fieldId] ?? "").trim())
    .map((field) => field.label);

  if (!String(formValues.guestName ?? "").trim()) {
    return ["姓名", ...missingFields];
  }

  return missingFields;
}

function formatDateLabel(date: string) {
  return `${date.slice(5).replace("-", "月")}日 ${weekdayLabel(date)}`;
}

function weekdayLabel(date: string) {
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][new Date(`${date}T00:00:00`).getDay()];
}

function buildCalendarDays(baseDate: string) {
  const [year, month] = baseDate.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const leading = (first.getDay() + 6) % 7;
  const days: Array<string | null> = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= last.getDate(); day += 1) {
    days.push(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  return days;
}

function ConfirmBooking(props: {
  member: AppState["member"];
  exhibition: Exhibition;
  session: ExhibitionSession;
  submitBooking: (noticeAccepted: boolean, formValues: Record<string, string>) => void;
}) {
  const [accepted, setAccepted] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>(
    {
      guestName: guestNameInitial(props.member),
      ...Object.fromEntries(props.exhibition.bookingFields.map((field) => [field.fieldId, ""])),
    },
  );

  React.useEffect(() => {
    setFormValues((current) => ({
      guestName: current.guestName ?? guestNameInitial(props.member),
      ...Object.fromEntries(props.exhibition.bookingFields.map((field) => [field.fieldId, ""])),
      ...current,
      ...(props.member.isRealNameVerified ? { guestName: guestNameInitial(props.member) } : {}),
    }));
  }, [props.exhibition.bookingFields, props.member]);

  return (
    <div className="space-y-4 p-4">
      <h2 className="text-lg font-semibold text-slate-950">确认报名</h2>
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-semibold text-slate-950">报名人信息</div>
        <ReadonlyField label="手机号" value={props.member.phone} />
        <ReadonlyField label="报名人数" value="仅限1人" />
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
          本预约凭证仅限当前会员本人使用。
        </p>
      </section>
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-semibold text-slate-950">报名内容</div>
        <InfoRow label="活动" value={props.exhibition.title} />
        <InfoRow label="地点" value={props.exhibition.location} />
        <InfoRow label="场次" value={`${props.session.sessionName} · ${formatRange(props.session.startTime, props.session.endTime)}`} />
      </section>
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-semibold text-slate-950">客人补充信息</div>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 flex items-center gap-2 text-slate-500">
              姓名
              <span className="text-xs font-semibold text-rose-600">必填</span>
              {props.member.isRealNameVerified && <span className="text-xs text-slate-400">已实名</span>}
            </span>
            <input
              value={formValues.guestName ?? ""}
              onChange={(event) => setFormValues({ ...formValues, guestName: event.target.value })}
              disabled={props.member.isRealNameVerified}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-950 disabled:bg-slate-50 disabled:text-slate-500"
              placeholder="请输入姓名"
              required
            />
          </label>
          {props.exhibition.bookingFields.map((field) => (
            <label key={field.fieldId} className="block text-sm">
              <span className="mb-1 flex items-center gap-2 text-slate-500">
                {field.label}
                {field.required && <span className="text-xs font-semibold text-rose-600">必填</span>}
              </span>
              <input
                value={formValues[field.fieldId] ?? ""}
                onChange={(event) => setFormValues({ ...formValues, [field.fieldId]: event.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-950"
                placeholder={`请输入${field.label}`}
                required={field.required}
              />
            </label>
          ))}
        </div>
      </section>
      <label className="flex items-start gap-3 rounded-2xl bg-white p-4 text-sm text-slate-700 shadow-sm">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-slate-950"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
        />
        <span>我已阅读并同意报名须知：{props.exhibition.notice}</span>
      </label>
      <button
        onClick={() => props.submitBooking(accepted, formValues)}
        className="h-12 w-full rounded-xl bg-slate-950 text-sm font-semibold text-white"
      >
        提交报名
      </button>
    </div>
  );
}

function SuccessPage({
  booking,
  exhibition,
  session,
  setPage,
}: {
  booking: Booking;
  exhibition: Exhibition;
  session: ExhibitionSession;
  setPage: (page: ClientPage) => void;
}) {
  return (
    <div className="space-y-4 p-4">
      <section className="rounded-2xl bg-white p-5 text-center shadow-sm">
        <CheckCircle2 className="mx-auto text-emerald-600" size={48} />
        <h2 className="mt-3 text-xl font-semibold text-slate-950">报名成功</h2>
        <p className="mt-1 text-sm text-slate-500">请在入场时出示以下凭证</p>
        <div className="mx-auto mt-5 flex h-36 w-36 items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50">
          <QrCode size={78} className="text-slate-400" />
        </div>
        <div className="mt-3 font-mono text-lg font-semibold tracking-wide text-slate-950">
          {booking.bookingCode}
        </div>
      </section>
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <InfoRow label="活动名称" value={exhibition.title} />
        <InfoRow label="场次" value={`${session.sessionName} · ${formatRange(session.startTime, session.endTime)}`} />
        <InfoRow label="活动地点" value={exhibition.location} />
        <InfoRow label="会员姓名" value={booking.memberName} />
        <InfoRow label="手机号" value={booking.memberPhone} />
        <BookingFormSummary booking={booking} exhibition={exhibition} excludeGuestName />
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">
          入场须知：报名码仅限会员本人使用，请按场次到场。二维码为 Demo 占位，后续可接入真实凭证生成与签到接口。
        </p>
      </section>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setPage("detail")}
          className="h-12 w-full rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700"
        >
          返回首页
        </button>
        <button
          onClick={() => setPage("my")}
          className="h-12 w-full rounded-xl bg-slate-950 text-sm font-semibold text-white"
        >
          查看我的活动
        </button>
      </div>
    </div>
  );
}

function BookingVoucherModal({
  booking,
  exhibition,
  session,
  onClose,
}: {
  booking: Booking;
  exhibition: Exhibition;
  session: ExhibitionSession;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/45 px-4 pb-4">
      <section className="w-full max-w-[398px] rounded-3xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-950">报名凭证二维码</div>
            <div className="mt-1 text-xs text-slate-500">请向现场员工出示此凭证</div>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500">
            <X size={16} />
          </button>
        </div>
        <div className="rounded-2xl bg-slate-50 p-5 text-center">
        <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50">
          <QrCode size={78} className="text-slate-400" />
        </div>
        <div className="mt-3 font-mono text-lg font-semibold tracking-wide text-slate-950">
          {booking.bookingCode}
        </div>
        <div className="mt-1 text-sm text-slate-500">{bookingStatusText(booking.status)}</div>
        </div>
        <div className="mt-4 rounded-2xl border border-slate-100 p-4">
        <InfoRow label="活动名称" value={exhibition.title} />
        <InfoRow label="场次" value={`${session.sessionName} · ${formatRange(session.startTime, session.endTime)}`} />
        <InfoRow label="会员姓名" value={booking.memberName} />
        <InfoRow label="手机号" value={booking.memberPhone} />
        <BookingFormSummary booking={booking} exhibition={exhibition} excludeGuestName />
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">
          Demo 中二维码为占位图。真实项目中员工端扫描该凭证后，由后台校验报名码并写入签到状态。
        </p>
        </div>
      <button onClick={onClose} className="mt-4 h-12 w-full rounded-xl bg-slate-950 text-sm font-semibold text-white">
        关闭
      </button>
      </section>
    </div>
  );
}

function StaffShell({
  state,
  checkInBookingByCode,
}: {
  state: AppState;
  checkInBookingByCode: (bookingCode: string) => StaffCheckInResult;
}) {
  const [scanOpen, setScanOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [result, setResult] = useState<StaffCheckInResult | null>(null);

  function scanCode(bookingCode: string) {
    const nextResult = checkInBookingByCode(bookingCode);
    setResult(nextResult);
    setScanOpen(false);
    setManualCode("");
  }

  return (
    <div className="mx-auto max-w-[430px] overflow-hidden rounded-[28px] border border-slate-200 bg-slate-100 shadow-xl">
      <div className="flex items-center justify-between bg-slate-950 px-5 py-3 text-white">
        <span className="text-sm">松赞员工端</span>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs">现场签到</span>
      </div>
      <div className="min-h-[760px] space-y-4 bg-[#f7f8fa] p-4">
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-slate-950">员工扫码签到</div>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                员工扫描客人手机里的报名凭证二维码，系统校验报名状态后完成签到。
              </p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <ScanLine size={24} />
            </div>
          </div>
          <button
            onClick={() => setScanOpen(true)}
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-semibold text-white"
          >
            <ScanLine size={18} />
            扫一扫
          </button>
        </section>
      </div>
      {scanOpen && (
        <StaffScanSheet
          bookings={state.bookings}
          exhibitions={state.exhibitions}
          sessions={state.sessions}
          manualCode={manualCode}
          setManualCode={setManualCode}
          onClose={() => setScanOpen(false)}
          onScan={scanCode}
        />
      )}
      {result && <StaffCheckInResultModal result={result} onClose={() => setResult(null)} />}
    </div>
  );
}

function StaffScanSheet({
  bookings,
  exhibitions,
  sessions,
  manualCode,
  setManualCode,
  onScan,
  onClose,
}: {
  bookings: Booking[];
  exhibitions: Exhibition[];
  sessions: ExhibitionSession[];
  manualCode: string;
  setManualCode: (value: string) => void;
  onScan: (bookingCode: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/45 px-4 pb-4">
      <section className="w-full max-w-[398px] rounded-3xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-950">模拟扫一扫</div>
            <div className="mt-1 text-xs text-slate-500">选择一张客人报名凭证，或输入报名码</div>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500">
            <X size={16} />
          </button>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">报名码</span>
            <input
              value={manualCode}
              onChange={(event) => setManualCode(event.target.value)}
              placeholder="例如 EX260604001"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-950"
            />
          </label>
          <button
            onClick={() => onScan(manualCode)}
            className="mt-3 h-10 w-full rounded-xl bg-slate-950 text-sm font-semibold text-white"
          >
            模拟扫描该报名码
          </button>
        </div>
        <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto pr-1">
          {bookings.map((booking) => {
            const exhibition = exhibitions.find((item) => item.exhibitionId === booking.exhibitionId);
            const session = sessions.find((item) => item.sessionId === booking.sessionId);
            return (
              <button
                key={booking.bookingId}
                onClick={() => onScan(booking.bookingCode)}
                className="flex w-full items-center gap-3 rounded-xl border border-slate-100 p-3 text-left hover:bg-slate-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                  <QrCode size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-slate-950">
                    {booking.memberName} · {booking.bookingCode}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">
                    {exhibition?.title ?? "活动缺失"} · {session?.sessionName ?? "场次缺失"} · {bookingStatusText(booking.status)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function StaffCheckInResultModal({
  result,
  onClose,
}: {
  result: StaffCheckInResult;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
      <section className="w-full max-w-[360px] rounded-3xl bg-white p-5 text-center shadow-2xl">
        <div
          className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${
            result.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
          }`}
        >
          {result.ok ? <CheckCircle2 size={30} /> : <CircleAlert size={30} />}
        </div>
        {result.ok ? (
          <>
            <h2 className="mt-4 text-lg font-semibold text-slate-950">客人：{result.guestName} 签到成功</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">签到场次{result.sessionText}</p>
          </>
        ) : (
          <>
            <h2 className="mt-4 text-lg font-semibold text-slate-950">签到失败，{result.reason}</h2>
            {result.bookingCode && (
              <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-xs text-slate-500">报名码 {result.bookingCode}</div>
            )}
          </>
        )}
        <button onClick={onClose} className="mt-5 h-11 w-full rounded-xl bg-slate-950 text-sm font-semibold text-white">
          知道了
        </button>
      </section>
    </div>
  );
}

function MyBookings(props: {
  bookings: Booking[];
  exhibitions: Exhibition[];
  sessions: ExhibitionSession[];
  cancelBooking: (bookingId: string) => void;
}) {
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);
  const statusOrder: Record<BookingStatus, number> = {
    pending_checkin: 0,
    checked_in: 1,
    cancelled: 2,
    expired: 3,
  };
  const sortedBookings = [...props.bookings].sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
  const detailBooking = sortedBookings.find((booking) => booking.bookingId === detailBookingId) ?? null;
  const detailExhibition = detailBooking
    ? props.exhibitions.find((item) => item.exhibitionId === detailBooking.exhibitionId) ?? null
    : null;
  const detailSession = detailBooking
    ? props.sessions.find((item) => item.sessionId === detailBooking.sessionId) ?? null
    : null;

  return (
    <div className="space-y-3 p-4">
      <h2 className="text-lg font-semibold text-slate-950">我的活动</h2>
      {props.bookings.length === 0 && (
        <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          暂无当前会员报名记录
        </div>
      )}
      {sortedBookings.map((booking) => {
        const exhibition = props.exhibitions.find((item) => item.exhibitionId === booking.exhibitionId)!;
        const session = props.sessions.find((item) => item.sessionId === booking.sessionId)!;
        return (
          <section key={booking.bookingId} className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-950">{exhibition.title}</div>
                <div className="mt-1 text-sm text-slate-600">
                  {session.sessionName} · {formatRange(session.startTime, session.endTime)}
                </div>
              </div>
              <BookingStatusPill status={booking.status} />
            </div>
            <div className="mt-4 rounded-xl bg-slate-50 p-3 font-mono text-sm text-slate-700">
              {booking.bookingCode}
            </div>
            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
              签到状态：
              <span className={booking.status === "checked_in" ? "font-semibold text-emerald-700" : "font-semibold text-slate-500"}>
                {booking.status === "checked_in" ? `已签到 · ${booking.signedInAt ?? "-"}` : bookingStatusText(booking.status)}
              </span>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setDetailBookingId(booking.bookingId)}
                className="flex-1 rounded-xl border border-slate-200 py-2 text-sm font-medium text-slate-700"
              >
                查看详情
              </button>
              <button
                disabled={booking.status !== "pending_checkin"}
                onClick={() => props.cancelBooking(booking.bookingId)}
                className="flex-1 rounded-xl bg-slate-950 py-2 text-sm font-medium text-white disabled:bg-slate-200 disabled:text-slate-500"
              >
                取消报名
              </button>
            </div>
          </section>
        );
      })}
      {detailBooking && detailExhibition && detailSession && (
        <BookingVoucherModal
          booking={detailBooking}
          exhibition={detailExhibition}
          session={detailSession}
          onClose={() => setDetailBookingId(null)}
        />
      )}
    </div>
  );
}

function AdminShell(props: {
  state: AppState;
  adminRole: AdminRole;
  setAdminRole: (role: AdminRole) => void;
  salesUser: SalesUser;
  selectedExhibitionId: string;
  setSelectedExhibitionId: (id: string) => void;
  page: AdminPage;
  setPage: (page: AdminPage) => void;
  addExhibition: () => void;
  cancelExhibition: (exhibitionId: string) => void;
  updateExhibition: (next: Exhibition) => void;
  updateRule: (next: BookingRule) => void;
  updateSession: (next: ExhibitionSession) => void;
  addSession: (next: ExhibitionSession) => void;
  cancelSession: (sessionId: string) => void;
  cancelBooking: (bookingId: string) => void;
  checkInBooking: (bookingId: string) => void;
  assistBooking: (member: Member, exhibitionId: string, sessionId: string, formValues: Record<string, string>) => boolean;
}) {
  const selectedExhibition = props.state.exhibitions.find(
    (item) => item.exhibitionId === props.selectedExhibitionId,
  )!;
  const selectedRule = props.state.rules.find(
    (item) => item.exhibitionId === props.selectedExhibitionId,
  )!;
  const selectedSessions = props.state.sessions.filter(
    (item) => item.exhibitionId === props.selectedExhibitionId,
  );
  const selectedBookings = props.state.bookings.filter(
    (item) => item.exhibitionId === props.selectedExhibitionId,
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-3 px-2 text-xs font-semibold uppercase text-slate-400">运营后台</div>
        <div className="mb-4 rounded-lg bg-slate-50 p-1">
          {[
            ["operator", "运营"],
            ["sales", "销售"],
          ].map(([role, label]) => (
            <button
              key={role}
              onClick={() => {
                const nextRole = role as AdminRole;
                props.setAdminRole(nextRole);
                if (nextRole === "operator" && props.page === "assist") {
                  props.setPage("activities");
                }
              }}
              className={`w-1/2 rounded-md px-3 py-2 text-sm font-medium ${props.adminRole === role ? "bg-slate-950 text-white" : "text-slate-600"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {[
          ["activities", "活动列表", ClipboardList],
          ["logs", "操作日志", FileClock],
          ...(props.adminRole === "sales" ? [["assist", "代客报名", UsersRound]] : []),
        ].map(([key, label, Icon]) => (
          <button
            key={key as string}
            onClick={() => props.setPage(key as AdminPage)}
            className={`mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium ${props.page === key ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            <Icon size={16} />
            {label as string}
          </button>
        ))}
      </aside>
      <section className="min-w-0">
        {props.page === "dashboard" && (
          <Dashboard exhibition={selectedExhibition} sessions={selectedSessions} bookings={selectedBookings} />
        )}
        {props.page === "activities" && (
          <ActivityList
            exhibitions={props.state.exhibitions}
            sessions={props.state.sessions}
            bookings={props.state.bookings}
            setSelectedExhibitionId={props.setSelectedExhibitionId}
            setPage={props.setPage}
            addExhibition={props.addExhibition}
            cancelExhibition={props.cancelExhibition}
          />
        )}
        {props.page === "config" && (
          <ConfigPage
            exhibition={selectedExhibition}
            rule={selectedRule}
            updateExhibition={props.updateExhibition}
            updateRule={props.updateRule}
          />
        )}
        {props.page === "sessions" && (
          <AdminSessions
            exhibitionId={props.selectedExhibitionId}
            sessions={selectedSessions}
            bookings={selectedBookings}
            readonly={selectedExhibition.status === "closed"}
            updateSession={props.updateSession}
            addSession={props.addSession}
            cancelSession={props.cancelSession}
          />
        )}
        {props.page === "bookings" && (
          <BookingList
            bookings={selectedBookings}
            allBookings={props.state.bookings}
            exhibitions={props.state.exhibitions}
            sessions={props.state.sessions}
            cancelBooking={props.cancelBooking}
            checkInBooking={props.checkInBooking}
          />
        )}
        {props.page === "logs" && (
          <OperationLogPage logs={props.state.operationLogs} />
        )}
        {props.page === "assist" && props.adminRole === "sales" && (
          <AssistedBookingPage
            members={props.state.members}
            exhibitions={props.state.exhibitions}
            rules={props.state.rules}
            sessions={props.state.sessions}
            bookings={props.state.bookings}
            salesUser={props.salesUser}
            assistBooking={props.assistBooking}
          />
        )}
      </section>
    </div>
  );
}

function Dashboard({
  exhibition,
  sessions,
  bookings,
}: {
  exhibition: Exhibition;
  sessions: ExhibitionSession[];
  bookings: Booking[];
}) {
  const sessionDates = useMemo(() => getSessionDates(sessions), [sessions]);
  const [sessionDateFilter, setSessionDateFilter] = useState("all");
  const filteredSessions = useMemo(
    () =>
      sessionDateFilter === "all"
        ? sessions
        : sessions.filter((session) => datePart(session.startTime) === sessionDateFilter),
    [sessions, sessionDateFilter],
  );
  const stats = useMemo(() => {
    const totalStock = sessions.reduce((sum, item) => sum + item.totalStock, 0);
    const booked = sessions.reduce((sum, item) => sum + item.bookedCount, 0);
    return {
      totalStock,
      booked,
      remain: totalStock - booked,
      assisted: bookings.filter((item) => item.source === "销售代客报名").length,
      signed: bookings.filter((item) => item.status === "checked_in" || Boolean(item.signedInAt)).length,
      cancelled: bookings.filter((item) => item.status === "cancelled").length,
    };
  }, [sessions, bookings]);

  return (
    <div className="space-y-5">
      <Panel
        title={`${exhibition.title} · 数据看板`}
        action={<span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">按单个活动统计</span>}
      >
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <AdminMetric label="总库存" value={stats.totalStock} />
        <AdminMetric label="已报名人数" value={stats.booked} />
        <AdminMetric label="剩余库存" value={stats.remain} />
        <AdminMetric label="内部代报名人数" value={stats.assisted} />
        <AdminMetric label="签到人数" value={stats.signed} />
        <AdminMetric label="取消人数" value={stats.cancelled} />
        </div>
      </Panel>
      <Panel
        title="各场次报名情况"
        action={
          <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
            时间筛选
            <select
              value={sessionDateFilter}
              onChange={(event) => setSessionDateFilter(event.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-950"
            >
              <option value="all">全部日期</option>
              {sessionDates.map((date) => (
                <option key={date} value={date}>
                  {formatDateLabel(date)}
                </option>
              ))}
            </select>
          </label>
        }
      >
        <div className="space-y-4">
          {filteredSessions.length === 0 && (
            <div className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">当前时间筛选下暂无场次</div>
          )}
          {filteredSessions.map((session) => {
            const percent = session.totalStock ? Math.round((session.bookedCount / session.totalStock) * 100) : 0;
            const signed = bookings.filter(
              (booking) =>
                booking.sessionId === session.sessionId &&
                (booking.status === "checked_in" || Boolean(booking.signedInAt)),
            ).length;
            const cancelled = bookings.filter(
              (booking) => booking.sessionId === session.sessionId && booking.status === "cancelled",
            ).length;
            const assisted = internalBookedCount(bookings, session.sessionId);
            return (
              <div key={session.sessionId}>
                <div className="mb-2 flex flex-col gap-1 text-sm md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="font-medium text-slate-700">{session.sessionName}</div>
                    <div className="mt-0.5 text-xs text-slate-400">{formatRange(session.startTime, session.endTime)}</div>
                  </div>
                  <span className="text-slate-500 md:text-right">
                    客用报名 {session.bookedCount}/{session.totalStock} · 内部代报名 {assisted} · 签到 {signed} · 取消 {cancelled}
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(percent, 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

function OperationLogPage({ logs }: { logs: OperationLog[] }) {
  const [typeFilter, setTypeFilter] = useState<"all" | OperationLog["objectType"]>("all");
  const [keyword, setKeyword] = useState("");
  const rows = logs.filter((log) => {
    const matchedType = typeFilter === "all" || log.objectType === typeFilter;
    const value = keyword.trim().toLowerCase();
    const matchedKeyword =
      !value ||
      [log.objectName, log.objectId, log.action, log.operatorName, log.detail].some((text) =>
        text.toLowerCase().includes(value),
      );
    return matchedType && matchedKeyword;
  });

  return (
    <Panel
      title="操作日志"
      action={
        <div className="flex flex-wrap gap-2">
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索对象/操作/操作人"
            className="h-10 min-w-64 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-950"
          />
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as "all" | OperationLog["objectType"])}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="all">全部对象</option>
            <option value="活动">活动</option>
            <option value="场次">场次</option>
          </select>
        </div>
      }
    >
      <Table>
        <thead>
          <tr>
            <Th>操作时间</Th>
            <Th>对象类型</Th>
            <Th>对象名称</Th>
            <Th>操作</Th>
            <Th>操作人</Th>
            <Th>详情</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((log) => (
            <tr key={log.logId} className="border-t border-slate-100">
              <Td>{log.createdAt}</Td>
              <Td>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  {log.objectType}
                </span>
              </Td>
              <Td>
                <div className="font-medium text-slate-950">{log.objectName}</div>
                <div className="mt-1 text-xs text-slate-400">{log.objectId}</div>
              </Td>
              <Td>{log.action}</Td>
              <Td>
                <div className="font-medium text-slate-700">{log.operatorName}</div>
                <div className="mt-1 text-xs text-slate-400">{log.operatorRole}</div>
              </Td>
              <Td>
                <div className="max-w-[520px] whitespace-normal leading-6">{log.detail}</div>
              </Td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr className="border-t border-slate-100">
              <Td className="text-center text-slate-400">暂无操作日志</Td>
              <Td>{""}</Td>
              <Td>{""}</Td>
              <Td>{""}</Td>
              <Td>{""}</Td>
              <Td>{""}</Td>
            </tr>
          )}
        </tbody>
      </Table>
    </Panel>
  );
}

function AssistedBookingPage(props: {
  members: Member[];
  exhibitions: Exhibition[];
  rules: BookingRule[];
  sessions: ExhibitionSession[];
  bookings: Booking[];
  salesUser: SalesUser;
  assistBooking: (member: Member, exhibitionId: string, sessionId: string, formValues: Record<string, string>) => boolean;
}) {
  const firstPublished = props.exhibitions.find((item) => item.status === "published") ?? props.exhibitions[0];
  const [query, setQuery] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [selectedExhibitionId, setSelectedExhibitionId] = useState(firstPublished?.exhibitionId ?? "");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  const selectedMember = props.members.find((member) => member.memberId === selectedMemberId) ?? null;
  const selectedExhibition = props.exhibitions.find((item) => item.exhibitionId === selectedExhibitionId) ?? null;
  const selectedRule = props.rules.find((item) => item.exhibitionId === selectedExhibitionId) ?? null;
  const exhibitionSessions = props.sessions.filter((session) => session.exhibitionId === selectedExhibitionId);
  const bookingDates = useMemo(() => getSessionDates(exhibitionSessions), [exhibitionSessions]);
  const selectedSessions = exhibitionSessions.filter((session) => datePart(session.startTime) === selectedDate);
  const selectedSession = props.sessions.find((session) => session.sessionId === selectedSessionId) ?? null;
  const filteredMembers = props.members.filter((member) => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return true;
    return [member.memberId, member.name, member.phone, member.level].some((value) =>
      value.toLowerCase().includes(keyword),
    );
  });
  const activeBookingBlocked =
    Boolean(selectedMember && selectedRule?.oneSessionPerMember && selectedExhibition) &&
    hasActiveBookingForExhibition(
      props.bookings,
      selectedExhibitionId,
      selectedMember?.memberId ?? "",
    );

  React.useEffect(() => {
    if (!bookingDates.includes(selectedDate)) {
      setSelectedDate(bookingDates[0] ?? "");
      setSelectedSessionId("");
    }
  }, [bookingDates, selectedDate]);

  React.useEffect(() => {
    setSelectedSessionId("");
    setMessage("");
  }, [selectedExhibitionId, selectedDate, selectedMemberId]);

  React.useEffect(() => {
    setFormValues((current) => ({
      ...Object.fromEntries((selectedExhibition?.bookingFields ?? []).map((field) => [field.fieldId, ""])),
      ...current,
      guestName: selectedMember ? guestNameInitial(selectedMember) : "",
    }));
  }, [selectedExhibitionId, selectedExhibition?.bookingFields, selectedMember]);

  function submitAssistedBooking() {
    setMessage("");
    if (!selectedMember) {
      setMessage("请先从会员库选择客人");
      return;
    }
    if (!selectedExhibition || !selectedRule) {
      setMessage("请先选择有效活动");
      return;
    }
    if (!selectedSession) {
      setMessage("请先选择可报名场次");
      return;
    }
    if (selectedExhibition.status !== "published") {
      setMessage("该活动未上架，销售不可代客报名");
      return;
    }
    if (!canSalesBookSession(selectedSession, props.bookings)) {
      if (isSessionBookingDeadlineReached(selectedSession)) {
        setMessage("该场次报名已截止，销售不可代报名");
        return;
      }
      setMessage(`该场次${statusText(displaySessionStatus(selectedSession, props.bookings, "sales"))}，销售不可代报名`);
      return;
    }
    if (activeBookingBlocked) {
      setMessage("该活动限制每位会员只能报名一个场次，该会员已有有效报名");
      return;
    }
    const missingFields = missingRequiredBookingFields(selectedExhibition, formValues);
    if (missingFields.length > 0) {
      setMessage(`请填写必填信息：${missingFields.join("、")}`);
      return;
    }
    const ok = props.assistBooking(selectedMember, selectedExhibition.exhibitionId, selectedSession.sessionId, formValues);
    if (ok) {
      setMessage(`代客报名成功：${selectedMember.name} · ${selectedSession.sessionName}`);
      setSelectedSessionId("");
    }
  }

  return (
    <div className="space-y-5">
      <Panel title="销售代客报名">
        <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
          <section className="space-y-4">
            <div className="rounded-xl bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase text-slate-400">当前销售</div>
              <div className="mt-2 text-lg font-semibold text-slate-950">{props.salesUser.salesUserName}</div>
              <div className="mt-1 text-sm text-slate-500">
                {props.salesUser.salesRole} · {props.salesUser.salesUserId}
              </div>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">搜索会员</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="输入会员ID、姓名、手机号"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-slate-950"
              />
            </label>

            <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {filteredMembers.map((member) => (
                <button
                  key={member.memberId}
                  onClick={() => setSelectedMemberId(member.memberId)}
                  className={`w-full rounded-xl border p-3 text-left ${selectedMemberId === member.memberId ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700"}`}
                >
                  <div className="font-semibold">{member.name}</div>
                  <div className={`mt-1 text-xs ${selectedMemberId === member.memberId ? "text-slate-300" : "text-slate-500"}`}>
                    {member.memberId} / {member.phone} / {member.level}
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">选择活动</span>
                <select
                  value={selectedExhibitionId}
                  onChange={(event) => setSelectedExhibitionId(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                >
                  {props.exhibitions.map((item) => (
                    <option key={item.exhibitionId} value={item.exhibitionId}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>
              <ReadonlyField label="报名人数" value="仅限1人" />
            </div>

            {selectedMember && (
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="mb-2 text-sm font-semibold text-slate-950">已选择会员</div>
                <ReadonlyField label="会员ID" value={selectedMember.memberId} />
                <ReadonlyField label="姓名" value={selectedMember.name} />
                <ReadonlyField label="手机号" value={selectedMember.phone} />
                <ReadonlyField label="会员等级" value={selectedMember.level} />
              </div>
            )}

            <div className="rounded-xl border border-slate-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-950">选择日期</span>
                <span className="text-xs text-slate-500">仅展示配置了场次的日期</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {bookingDates.map((date) => (
                  <button
                    key={date}
                    onClick={() => setSelectedDate(date)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium ${selectedDate === date ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}
                  >
                    {formatDateLabel(date)}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <div className="mb-3 text-sm font-semibold text-slate-950">选择场次</div>
              <div className="grid gap-3 md:grid-cols-2">
                {selectedSessions.map((session) => {
                  const displayStatus = displaySessionStatus(session, props.bookings, "sales");
                  const disabled = !canSalesBookSession(session, props.bookings);
                  return (
                    <button
                      key={session.sessionId}
                      disabled={disabled}
                      onClick={() => setSelectedSessionId(session.sessionId)}
                      className={`rounded-xl border p-3 text-left ${selectedSessionId === session.sessionId ? "border-slate-950 bg-slate-950 text-white" : disabled ? "border-slate-200 bg-slate-50 text-slate-400" : "border-slate-200 bg-white text-slate-700"}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold">{session.sessionName}</div>
                          <div className="mt-1 text-xs opacity-75">
                            {timePart(session.startTime)} - {timePart(session.endTime)}
                          </div>
                        </div>
                        <span className="rounded-full bg-white/20 px-2 py-1 text-xs">{statusText(displayStatus)}</span>
                      </div>
                      <div className="mt-3 text-xs opacity-75">
                        剩余库存 {remainingStock(session)} · 内部已代报名 {internalBookedCount(props.bookings, session.sessionId)} 人
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedExhibition && (
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="mb-3 text-sm font-semibold text-slate-950">客人补充信息</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block text-sm">
                    <span className="mb-1 flex items-center gap-2 font-medium text-slate-700">
                      姓名
                      <span className="text-xs font-semibold text-rose-600">必填</span>
                      {selectedMember?.isRealNameVerified && <span className="text-xs font-normal text-slate-400">已实名</span>}
                    </span>
                    <input
                      value={formValues.guestName ?? ""}
                      onChange={(event) => setFormValues({ ...formValues, guestName: event.target.value })}
                      disabled={selectedMember?.isRealNameVerified}
                      placeholder="请输入姓名"
                      required
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-slate-950 disabled:bg-slate-50 disabled:text-slate-500"
                    />
                  </label>
                  {selectedExhibition.bookingFields.map((field) => (
                    <label key={field.fieldId} className="block text-sm">
                      <span className="mb-1 flex items-center gap-2 font-medium text-slate-700">
                        {field.label}
                        {field.required && <span className="text-xs font-semibold text-rose-600">必填</span>}
                      </span>
                      <input
                        value={formValues[field.fieldId] ?? ""}
                        onChange={(event) => setFormValues({ ...formValues, [field.fieldId]: event.target.value })}
                        placeholder={`请输入${field.label}`}
                        required={field.required}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-slate-950"
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              规则提示：销售代客报名仅可选择现有会员，和客用报名共用同一个场次总库存；仍遵守活动上架、场次状态、场次报名截止时间和每会员限约一场规则。
              {activeBookingBlocked && (
                <div className="mt-2 font-semibold text-rose-700">该会员已有有效报名，当前规则禁止再次报名。</div>
              )}
              {message && <div className="mt-2 font-semibold text-slate-950">{message}</div>}
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={submitAssistedBooking} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
                提交代客报名
              </button>
            </div>
          </section>
        </div>
      </Panel>
    </div>
  );
}

function ActivityList(props: {
  exhibitions: Exhibition[];
  sessions: ExhibitionSession[];
  bookings: Booking[];
  setSelectedExhibitionId: (id: string) => void;
  setPage: (page: AdminPage) => void;
  addExhibition: () => void;
  cancelExhibition: (exhibitionId: string) => void;
}) {
  const [linkExhibition, setLinkExhibition] = useState<Exhibition | null>(null);
  const [keyword, setKeyword] = useState("");
  const filteredExhibitions = props.exhibitions.filter((item) => {
    const value = keyword.trim().toLowerCase();
    if (!value) return true;
    return [item.title, item.location, item.exhibitionId].some((text) => text.toLowerCase().includes(value));
  });

  return (
    <>
    <Panel
      title="活动列表"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索活动名称/地点"
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-950"
          />
          <button
            onClick={props.addExhibition}
            className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
          >
            新增活动
          </button>
        </div>
      }
    >
      <Table>
        <thead>
          <tr>
            <Th>活动名称</Th>
            <Th>活动地点</Th>
            <Th>活动时间</Th>
            <Th>状态</Th>
            <Th>总报名人数</Th>
            <Th>操作</Th>
          </tr>
        </thead>
        <tbody>
          {filteredExhibitions.map((item) => {
            const activityBookings = props.bookings.filter((booking) => booking.exhibitionId === item.exhibitionId);
            const booked =
              item.status === "closed"
                ? activityBookings.length
                : activityBookings.filter((booking) => booking.status !== "cancelled").length;
            return (
              <tr key={item.exhibitionId} className="border-t border-slate-100">
                <Td className="font-medium text-slate-950">{item.title}</Td>
                <Td>{item.location}</Td>
                <Td>{formatRange(item.exhibitionStartTime, item.exhibitionEndTime)}</Td>
                <Td>{item.status === "published" ? "已上架" : item.status === "closed" ? "已取消" : "下架"}</Td>
                <Td>{booked}</Td>
                <Td>
                  <div className="flex flex-wrap gap-2">
                    <AdminAction onClick={() => { props.setSelectedExhibitionId(item.exhibitionId); props.setPage("config"); }}>
                      {item.status === "closed" ? "查看配置" : "编辑"}
                    </AdminAction>
                    <AdminAction onClick={() => { props.setSelectedExhibitionId(item.exhibitionId); props.setPage("dashboard"); }}>查看数据</AdminAction>
                    <AdminAction onClick={() => { props.setSelectedExhibitionId(item.exhibitionId); props.setPage("sessions"); }}>场次管理</AdminAction>
                    <AdminAction onClick={() => { props.setSelectedExhibitionId(item.exhibitionId); props.setPage("bookings"); }}>报名名单</AdminAction>
                    {item.shareEnabled && <AdminAction onClick={() => setLinkExhibition(item)}>复制链接</AdminAction>}
                    {item.status !== "closed" && (
                      <AdminAction
                        tone="danger"
                        onClick={() => {
                          const ok = window.confirm(
                            `确认由于官方原因取消活动「${item.title}」吗？确认后所有已报名会员状态将变为已取消，活动不可再编辑。`,
                          );
                          if (ok) props.cancelExhibition(item.exhibitionId);
                        }}
                      >
                        取消活动
                      </AdminAction>
                    )}
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </Panel>
    {linkExhibition && (
      <ActivityLinkModal exhibition={linkExhibition} onClose={() => setLinkExhibition(null)} />
    )}
    </>
  );
}

function ActivityLinkModal({
  exhibition,
  onClose,
}: {
  exhibition: Exhibition;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const activityLink =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}${window.location.pathname}?activityId=${encodeURIComponent(exhibition.exhibitionId)}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(activityLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
      window.alert("当前浏览器不支持复制，请手动复制活动链接");
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 px-4">
      <section className="w-full max-w-[420px] rounded-3xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-slate-950">活动投放链接</div>
            <div className="mt-1 text-xs text-slate-500">用于销售转发、社群或外部渠道投放</div>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500">
            <X size={16} />
          </button>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <div className="text-sm font-semibold text-slate-950">{exhibition.title}</div>
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-white p-3">
            <div className="min-w-0 flex-1 break-all font-mono text-xs leading-5 text-slate-600">
              {activityLink}
            </div>
            <button
              onClick={copyLink}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              title="复制活动链接"
              aria-label="复制活动链接"
            >
              <Copy size={16} />
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4 rounded-2xl border border-slate-100 p-4">
          <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50">
            <QrCode size={58} className="text-slate-500" />
          </div>
          <div className="min-w-0 text-sm">
            <div className="font-semibold text-slate-950">活动页二维码</div>
            <p className="mt-2 leading-6 text-slate-500">
              二维码为 Demo 占位，真实项目可接活动页二维码或小程序码生成接口。
            </p>
          </div>
        </div>

        <button
          onClick={copyLink}
          className="mt-5 h-12 w-full rounded-xl bg-slate-950 text-sm font-semibold text-white"
        >
          {copied ? "已复制" : "复制活动链接"}
        </button>
      </section>
    </div>
  );
}

function ConfigPage(props: {
  exhibition: Exhibition;
  rule: BookingRule;
  updateExhibition: (next: Exhibition) => void;
  updateRule: (next: BookingRule) => void;
}) {
  const [draft, setDraft] = useState(props.exhibition);
  const [ruleDraft, setRuleDraft] = useState(props.rule);

  React.useEffect(() => {
    setDraft(props.exhibition);
    setRuleDraft(props.rule);
  }, [props.exhibition, props.rule]);

  const isCancelled = props.exhibition.status === "closed";

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="活动配置">
        <fieldset disabled={isCancelled} className="grid gap-3 disabled:opacity-75">
          {isCancelled && (
            <div className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm font-medium text-rose-700">
              该活动已因官方原因取消，活动配置已锁定，仅支持查看历史配置。
            </div>
          )}
          <TextInput label="活动名称" value={draft.title} onChange={(title) => setDraft({ ...draft, title })} />
          <TextInput label="主图 URL" value={draft.coverImage} onChange={(coverImage) => setDraft({ ...draft, coverImage })} />
          <TextArea label="活动简介" value={draft.description} onChange={(description) => setDraft({ ...draft, description })} />
          <TextArea
            label="活动详细描述"
            value={draft.detailedDescription}
            onChange={(detailedDescription) => setDraft({ ...draft, detailedDescription })}
          />
          <TextInput label="活动地点" value={draft.location} onChange={(location) => setDraft({ ...draft, location })} />
          <div className="grid gap-3 md:grid-cols-2">
            <TextInput label="活动开始时间" value={draft.exhibitionStartTime} onChange={(exhibitionStartTime) => setDraft({ ...draft, exhibitionStartTime })} />
            <TextInput label="活动结束时间" value={draft.exhibitionEndTime} onChange={(exhibitionEndTime) => setDraft({ ...draft, exhibitionEndTime })} />
            <TextInput label="报名开始时间" value={draft.bookingStartTime} onChange={(bookingStartTime) => setDraft({ ...draft, bookingStartTime })} />
            <TextInput label="报名时间" value={draft.bookingEndTime} onChange={(bookingEndTime) => setDraft({ ...draft, bookingEndTime })} />
          </div>
          <TextArea label="报名须知" value={draft.notice} onChange={(notice) => setDraft({ ...draft, notice })} />
          <ToggleRow
            label="是否允许分享"
            checked={draft.shareEnabled}
            onChange={(shareEnabled) => setDraft({ ...draft, shareEnabled })}
          />
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="mb-3">
              <div className="text-sm font-semibold text-slate-950">报名成功短信文案配置</div>
              <div className="mt-1 text-xs text-slate-500">
                用于不同活动报名成功后发送不同短信，真实项目由后端短信服务读取该模板发送。
              </div>
            </div>
            <TextArea
              label="短信文案"
              value={draft.successSmsTemplate}
              onChange={(successSmsTemplate) => setDraft({ ...draft, successSmsTemplate })}
            />
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="mb-3 text-sm font-semibold text-slate-950">小程序分享海报配置</div>
            <div className="grid gap-3">
              <TextInput
                label="分享海报图 URL"
                value={draft.sharePosterImage}
                onChange={(sharePosterImage) => setDraft({ ...draft, sharePosterImage })}
              />
              <TextInput
                label="分享海报标题"
                value={draft.sharePosterTitle}
                onChange={(sharePosterTitle) => setDraft({ ...draft, sharePosterTitle })}
              />
              <TextArea
                label="分享海报描述"
                value={draft.sharePosterDesc}
                onChange={(sharePosterDesc) => setDraft({ ...draft, sharePosterDesc })}
              />
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-950">客人填写信息配置</div>
                <div className="mt-1 text-xs text-slate-500">全部字段在 C 端和销售代报名页展示为文本输入框</div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    bookingFields: [
                      ...draft.bookingFields,
                      { fieldId: `custom_${Date.now()}`, label: "新增字段", required: false },
                    ],
                  })
                }
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
              >
                新增字段
              </button>
            </div>
            <div className="space-y-2">
              {draft.bookingFields.map((field, index) => (
                <div key={field.fieldId} className="flex gap-2">
                  <input
                    value={field.label}
                    onChange={(event) => {
                      const nextFields = draft.bookingFields.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, label: event.target.value } : item,
                      );
                      setDraft({ ...draft, bookingFields: nextFields });
                    }}
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
                  />
                  <label className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">
                    <input
                      type="checkbox"
                      checked={field.required}
                      className="h-4 w-4 accent-slate-950"
                      onChange={(event) => {
                        const nextFields = draft.bookingFields.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, required: event.target.checked } : item,
                        );
                        setDraft({ ...draft, bookingFields: nextFields });
                      }}
                    />
                    必填
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        bookingFields: draft.bookingFields.filter((item) => item.fieldId !== field.fieldId),
                      })
                    }
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-rose-600"
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          </div>
          <label className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm">
            <span className="font-medium text-slate-700">是否上架</span>
            <input
              type="checkbox"
              checked={draft.status === "published"}
              className="h-5 w-5 accent-slate-950"
              onChange={(event) => setDraft({ ...draft, status: event.target.checked ? "published" : "draft" })}
            />
          </label>
          <button className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white" onClick={() => props.updateExhibition(draft)}>
            保存活动配置
          </button>
        </fieldset>
      </Panel>
      <Panel title="报名规则配置">
        <fieldset disabled={isCancelled} className="space-y-3 disabled:opacity-75">
          {isCancelled && (
            <div className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm font-medium text-rose-700">
              该活动已取消，报名规则已锁定，仅支持查看。
            </div>
          )}
          <ToggleRow label="每会员只能报名一个场次" checked={ruleDraft.oneSessionPerMember} onChange={(oneSessionPerMember) => setRuleDraft({ ...ruleDraft, oneSessionPerMember })} />
          <ToggleRow label="允许取消报名" checked={ruleDraft.allowCancel} onChange={(allowCancel) => setRuleDraft({ ...ruleDraft, allowCancel })} />
          <TextInput
            label="取消截止时间（活动开始前小时）"
            value={String(ruleDraft.cancelDeadlineHours)}
            onChange={(value) => setRuleDraft({ ...ruleDraft, cancelDeadlineHours: Number(value) || 0 })}
          />
          <button className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white" onClick={() => props.updateRule(ruleDraft)}>
            保存报名规则
          </button>
        </fieldset>
      </Panel>
    </div>
  );
}

function AdminSessions({
  exhibitionId,
  sessions,
  bookings,
  readonly,
  updateSession,
  addSession,
  cancelSession,
}: {
  exhibitionId: string;
  sessions: ExhibitionSession[];
  bookings: Booking[];
  readonly: boolean;
  updateSession: (next: ExhibitionSession) => void;
  addSession: (next: ExhibitionSession) => void;
  cancelSession: (sessionId: string) => void;
}) {
  const [creating, setCreating] = useState(false);

  return (
    <Panel
      title="场次管理"
      action={
        readonly ? (
          <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">活动已取消，场次只读</span>
        ) : (
          <button
            onClick={() => setCreating((value) => !value)}
            className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white"
          >
            {creating ? "收起新增" : "新增场次"}
          </button>
        )
      }
    >
      {creating && !readonly && (
        <NewSessionForm
          exhibitionId={exhibitionId}
          onCancel={() => setCreating(false)}
          onSubmit={(next) => {
            addSession(next);
            setCreating(false);
          }}
        />
      )}
      <Table>
        <thead>
          <tr>
            <Th>场次名称</Th>
            <Th>日期</Th>
            <Th>时间</Th>
            <Th>总库存</Th>
            <Th>场次开始前报名截止</Th>
            <Th>已报名</Th>
            <Th>剩余库存</Th>
            <Th>内部代报名</Th>
            <Th>状态</Th>
            <Th>操作</Th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <SessionRow key={session.sessionId} session={session} bookings={bookings} readonly={readonly} updateSession={updateSession} cancelSession={cancelSession} />
          ))}
        </tbody>
      </Table>
    </Panel>
  );
}

function NewSessionForm({
  exhibitionId,
  onSubmit,
  onCancel,
}: {
  exhibitionId: string;
  onSubmit: (next: ExhibitionSession) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState({
    sessionName: "新增场次",
    date: "2026-06-25",
    startTime: "14:00",
    endTime: "16:00",
    totalStock: 30,
    bookingCloseHours: 12,
  });

  return (
    <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 text-sm font-semibold text-slate-950">新增场次</div>
      <div className="grid gap-3 md:grid-cols-6">
        <label className="block text-sm md:col-span-1">
          <span className="mb-1 block font-medium text-slate-700">场次名称</span>
          <input
            value={draft.sessionName}
            onChange={(event) => setDraft({ ...draft, sessionName: event.target.value })}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-slate-950"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">日期</span>
          <input
            type="date"
            value={draft.date}
            onChange={(event) => setDraft({ ...draft, date: event.target.value })}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-slate-950"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">开始时间</span>
          <input
            type="time"
            value={draft.startTime}
            onChange={(event) => setDraft({ ...draft, startTime: event.target.value })}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-slate-950"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">结束时间</span>
          <input
            type="time"
            value={draft.endTime}
            onChange={(event) => setDraft({ ...draft, endTime: event.target.value })}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-slate-950"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">总库存</span>
          <input
            type="number"
            value={draft.totalStock}
            onChange={(event) => setDraft({ ...draft, totalStock: Number(event.target.value) || 0 })}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-slate-950"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">场次开始前报名截止</span>
          <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white focus-within:border-slate-950">
            <input
              type="number"
              value={draft.bookingCloseHours}
              onChange={(event) => setDraft({ ...draft, bookingCloseHours: Number(event.target.value) || 0 })}
              className="min-w-0 flex-1 px-3 py-2 outline-none"
            />
            <span className="shrink-0 border-l border-slate-200 px-3 text-sm text-slate-500">小时</span>
          </div>
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
          取消
        </button>
        <button
          onClick={() =>
            onSubmit({
              sessionId: `SES${Date.now()}`,
              exhibitionId,
              sessionName: draft.sessionName || "新增场次",
              startTime: composeDateTime(draft.date, draft.startTime),
              endTime: composeDateTime(draft.date, draft.endTime),
              totalStock: Math.max(draft.totalStock, 0),
              bookedCount: 0,
              bookingCloseHours: Math.max(draft.bookingCloseHours, 0),
              status: "open",
            })
          }
          className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
        >
          保存新增场次
        </button>
      </div>
    </div>
  );
}

function SessionRow({
  session,
  bookings,
  readonly,
  updateSession,
  cancelSession,
}: {
  session: ExhibitionSession;
  bookings: Booking[];
  readonly: boolean;
  updateSession: (next: ExhibitionSession) => void;
  cancelSession: (sessionId: string) => void;
}) {
  const [draft, setDraft] = useState(session);
  React.useEffect(() => setDraft(session), [session]);
  const displayStatus = displaySessionStatus(draft);

  return (
    <tr className="border-t border-slate-100 align-top">
      <Td><InlineInput value={draft.sessionName} disabled={readonly} onChange={(sessionName) => setDraft({ ...draft, sessionName })} /></Td>
      <Td>
        <InlineInput
          type="date"
          disabled={readonly}
          value={datePart(draft.startTime)}
          onChange={(date) =>
            setDraft({
              ...draft,
              startTime: composeDateTime(date, timePart(draft.startTime)),
              endTime: composeDateTime(date, timePart(draft.endTime)),
            })
          }
        />
      </Td>
      <Td>
        <div className="grid gap-2">
          <InlineInput
            type="time"
            disabled={readonly}
            value={timePart(draft.startTime)}
            onChange={(startTime) => setDraft({ ...draft, startTime: composeDateTime(datePart(draft.startTime), startTime) })}
          />
          <InlineInput
            type="time"
            disabled={readonly}
            value={timePart(draft.endTime)}
            onChange={(endTime) => setDraft({ ...draft, endTime: composeDateTime(datePart(draft.startTime), endTime) })}
          />
        </div>
      </Td>
      <Td><InlineInput compact type="number" disabled={readonly} value={String(draft.totalStock)} onChange={(value) => setDraft({ ...draft, totalStock: Number(value) || 0 })} /></Td>
      <Td>
        <InlineNumberWithSuffix
          compact
          disabled={readonly}
          value={String(draft.bookingCloseHours ?? 12)}
          suffix="小时"
          onChange={(value) => setDraft({ ...draft, bookingCloseHours: Number(value) || 0 })}
        />
      </Td>
      <Td>{draft.bookedCount}</Td>
      <Td>{remainingStock(draft)}</Td>
      <Td>{internalBookedCount(bookings, draft.sessionId)}</Td>
      <Td>
        <StatusPill status={displayStatus} />
      </Td>
      <Td>
        {readonly ? (
          <span className="text-xs text-slate-400">只读</span>
        ) : (
          <div className="flex gap-2">
            <AdminAction
              onClick={() =>
                updateSession({
                  ...draft,
                  bookedCount: Math.min(draft.bookedCount, draft.totalStock),
                })
              }
            >
              保存
            </AdminAction>
            {draft.status !== "closed" && (
              <AdminAction
                tone="danger"
                onClick={() => {
                  const ok = window.confirm(`确认取消场次「${draft.sessionName}」吗？确认后该场次报名将批量变为已取消。`);
                  if (ok) cancelSession(draft.sessionId);
                }}
              >
                取消场次
              </AdminAction>
            )}
          </div>
        )}
      </Td>
    </tr>
  );
}

function BookingList(props: {
  bookings: Booking[];
  allBookings: Booking[];
  exhibitions: Exhibition[];
  sessions: ExhibitionSession[];
  cancelBooking: (bookingId: string) => void;
  checkInBooking: (bookingId: string) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<"all" | BookingStatus>("all");
  const [memberQuery, setMemberQuery] = useState("");
  const [detailBooking, setDetailBooking] = useState<Booking | null>(null);
  const rows = props.bookings.filter((item) => {
    const matchedStatus = statusFilter === "all" || item.status === statusFilter;
    const keyword = memberQuery.trim().toLowerCase();
    const matchedMember =
      !keyword ||
      [item.memberName, item.memberId, item.memberPhone].some((value) =>
        value.toLowerCase().includes(keyword),
      );
    return matchedStatus && matchedMember;
  });
  function exportRows() {
    const headers = ["预约码", "会员ID", "会员姓名", "手机号", "会员等级", "场次", "状态", "创建时间", "来源", "销售顾问"];
    const lines = rows.map((booking) => {
      const session = props.sessions.find((item) => item.sessionId === booking.sessionId);
      return [
        booking.bookingCode,
        booking.memberId,
        booking.memberName,
        booking.memberPhone,
        booking.memberLevel,
        session ? `${session.sessionName} ${formatRange(session.startTime, session.endTime)}` : "",
        bookingStatusText(booking.status),
        booking.createdAt,
        bookingSourceText(booking.source),
        booking.salesUserName ?? "",
      ]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(",");
    });
    const blob = new Blob([[headers.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `报名名单-${nowText().replace(/[: ]/g, "-")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <Panel
      title="报名名单"
      action={
        <div className="flex flex-wrap gap-2">
          <input
            value={memberQuery}
            onChange={(event) => setMemberQuery(event.target.value)}
            placeholder="按会员姓名/卡号/手机号查询"
            className="h-10 min-w-64 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-950"
          />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | BookingStatus)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="all">全部状态</option>
            <option value="pending_checkin">待签到</option>
            <option value="cancelled">已取消</option>
            <option value="checked_in">已签到</option>
            <option value="expired">已过期</option>
          </select>
          <button onClick={exportRows} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
            导出
          </button>
        </div>
      }
    >
      <Table>
        <thead>
          <tr>
            <Th>二维码</Th>
            <Th>会员信息</Th>
            <Th>场次</Th>
            <Th>状态</Th>
            <Th>填写信息</Th>
            <Th>签到状态</Th>
            <Th>签到时间</Th>
            <Th>创建时间</Th>
            <Th>来源</Th>
            <Th>销售顾问</Th>
            <Th>操作</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((booking) => {
            const exhibition = props.exhibitions.find((item) => item.exhibitionId === booking.exhibitionId)!;
            const session = props.sessions.find((item) => item.sessionId === booking.sessionId)!;
            return (
              <tr key={booking.bookingId} className="border-t border-slate-100">
                <Td>
                  <div className="flex w-20 flex-col items-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50">
                      <QrCode size={28} className="text-slate-500" />
                    </div>
                    <div className="mt-1 max-w-20 truncate font-mono text-[10px] text-slate-400">
                      {booking.bookingCode}
                    </div>
                  </div>
                </Td>
                <Td>
                  <div className="font-medium text-slate-950">{booking.memberName}</div>
                  <div className="text-xs text-slate-500">{booking.memberId} / {booking.memberPhone} / {booking.memberLevel}</div>
                </Td>
                <Td>
                  <div className="font-medium text-slate-700">{session.sessionName}</div>
                  <div className="text-xs text-slate-500">{formatRange(session.startTime, session.endTime)}</div>
                </Td>
                <Td>{bookingStatusText(booking.status)}</Td>
                <Td>
                  {booking.formValues && Object.values(booking.formValues).some(Boolean) ? (
                    <div className="max-w-[220px] space-y-1 text-xs text-slate-600">
                      {Object.entries(booking.formValues)
                        .filter(([, value]) => Boolean(value))
                        .slice(0, 3)
                        .map(([key, value]) => {
                          return (
                            <div key={key} className="truncate">
                              <span className="text-slate-400">{bookingFormLabel(key, exhibition)}：</span>
                              {value}
                            </div>
                          );
                        })}
                    </div>
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </Td>
                <Td>
                  <span className={booking.status === "checked_in" ? "font-medium text-emerald-700" : "text-slate-400"}>
                    {booking.status === "checked_in" ? "已签到" : bookingStatusText(booking.status)}
                  </span>
                </Td>
                <Td>
                  <div>{booking.signedInAt ?? "-"}</div>
                  <div className="text-xs text-slate-400">{booking.signInSource ?? ""}</div>
                </Td>
                <Td>{booking.createdAt}</Td>
                <Td>{bookingSourceText(booking.source)}</Td>
                <Td>
                  {booking.salesUserName ? (
                    <div>
                      <div className="font-medium text-slate-700">{booking.salesUserName}</div>
                      <div className="text-xs text-slate-400">{booking.salesRole} / {booking.assistedAt}</div>
                    </div>
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-2">
                    <AdminAction onClick={() => setDetailBooking(booking)}>查看详情</AdminAction>
                    <AdminAction onClick={() => props.cancelBooking(booking.bookingId)}>取消报名</AdminAction>
                    <AdminAction onClick={() => props.checkInBooking(booking.bookingId)}>模拟签到</AdminAction>
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      {detailBooking && (
        <MemberDetailModal
          booking={detailBooking}
          allBookings={props.allBookings}
          exhibitions={props.exhibitions}
          sessions={props.sessions}
          onClose={() => setDetailBooking(null)}
        />
      )}
    </Panel>
  );
}

function MemberDetailModal({
  booking,
  allBookings,
  exhibitions,
  sessions,
  onClose,
}: {
  booking: Booking;
  allBookings: Booking[];
  exhibitions: Exhibition[];
  sessions: ExhibitionSession[];
  onClose: () => void;
}) {
  const memberBookings = allBookings.filter((item) => item.memberId === booking.memberId);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 px-4">
      <section className="max-h-[86vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold text-slate-950">会员信息详情</div>
            <div className="mt-1 text-sm text-slate-500">{booking.memberName} · {booking.memberId}</div>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500">
            <X size={16} />
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <ReadonlyField label="姓名" value={booking.memberName} />
          <ReadonlyField label="手机号" value={booking.memberPhone} />
          <ReadonlyField label="会员等级" value={booking.memberLevel} />
          <ReadonlyField label="报名次数" value={`${memberBookings.length}`} />
        </div>
        <div className="mt-5 text-sm font-semibold text-slate-950">该会员报名活动记录</div>
        <div className="mt-3 space-y-3">
          {memberBookings.map((item) => {
            const exhibition = exhibitions.find((target) => target.exhibitionId === item.exhibitionId);
            const session = sessions.find((target) => target.sessionId === item.sessionId);
            return (
              <div key={item.bookingId} className="rounded-2xl border border-slate-100 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-950">{exhibition?.title ?? "活动缺失"}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      {session ? `${session.sessionName} · ${formatRange(session.startTime, session.endTime)}` : "场次缺失"}
                    </div>
                  </div>
                  <BookingStatusPill status={item.status} />
                </div>
                <div className="mt-3 text-xs text-slate-500">
                  {item.bookingCode} · {item.createdAt} · {bookingSourceText(item.source)}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-3 flex gap-3 text-sm">
      <span className="w-20 shrink-0 text-slate-400">{label}</span>
      <span className="min-w-0 flex-1 text-slate-700">{value}</span>
    </div>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-2 last:border-b-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-900">{value}</span>
    </div>
  );
}

function MetricMini({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-lg font-semibold text-slate-950">{value}</div>
      <div className="mt-1 text-slate-500">{label}</div>
    </div>
  );
}

function StatusPill({ status }: { status: SessionStatus }) {
  const className =
    status === "open"
      ? "bg-emerald-50 text-emerald-700"
      : status === "full"
        ? "bg-rose-50 text-rose-700"
        : "bg-slate-100 text-slate-500";
  return <span className={`rounded-full px-3 py-1 text-xs font-medium ${className}`}>{statusText(status)}</span>;
}

function BookingStatusPill({ status }: { status: BookingStatus }) {
  const className =
    status === "pending_checkin"
      ? "bg-blue-50 text-blue-700"
      : status === "checked_in"
        ? "bg-emerald-50 text-emerald-700"
        : "bg-slate-100 text-slate-500";
  return <span className={`rounded-full px-3 py-1 text-xs font-medium ${className}`}>{bookingStatusText(status)}</span>;
}

function AdminMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function BookingFormSummary({
  booking,
  exhibition,
  excludeGuestName = false,
}: {
  booking: Booking;
  exhibition: Exhibition;
  excludeGuestName?: boolean;
}) {
  const entries = bookingFormEntries(booking, exhibition, { excludeGuestName });
  if (entries.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl bg-slate-50 p-3">
      <div className="mb-2 text-xs font-semibold text-slate-500">补充信息</div>
      <div className="space-y-1">
        {entries.map((entry) => (
          <InfoRow key={entry.key} label={entry.label} value={entry.value} />
        ))}
      </div>
    </div>
  );
}

function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Table({ children }: { children: React.ReactNode }) {
  return <div className="scrollbar-thin overflow-x-auto"><table className="w-full min-w-[1280px] border-collapse text-left text-sm">{children}</table></div>;
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap bg-slate-50 px-3 py-3 text-xs font-semibold uppercase text-slate-500">{children}</th>;
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-3 text-slate-600 ${className}`}>{children}</td>;
}

function AdminAction({
  children,
  onClick,
  tone = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  const className =
    tone === "danger"
      ? "border-rose-200 text-rose-600 hover:bg-rose-50"
      : "border-slate-200 text-slate-700 hover:bg-slate-50";
  return (
    <button onClick={onClick} className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${className}`}>
      {children}
    </button>
  );
}

function TextInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-slate-950" />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-slate-950" />
    </label>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <input type="checkbox" checked={checked} className="h-5 w-5 accent-slate-950" onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function InlineInput({
  value,
  onChange,
  type = "text",
  disabled = false,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={`${compact ? "w-20 min-w-20" : "w-full min-w-28"} rounded-lg border border-slate-200 px-2 py-1 text-sm disabled:bg-slate-50 disabled:text-slate-500`}
    />
  );
}

function InlineNumberWithSuffix({
  value,
  onChange,
  suffix,
  disabled = false,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  suffix: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`flex ${compact ? "w-24 min-w-24" : "min-w-32"} items-center overflow-hidden rounded-lg border border-slate-200 bg-white`}>
      <input
        type="number"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 px-2 py-1 text-sm outline-none disabled:bg-slate-50 disabled:text-slate-500"
      />
      <span className="shrink-0 border-l border-slate-200 px-2 text-xs text-slate-500">{suffix}</span>
    </div>
  );
}

function ToastView({ toast }: { toast: Toast }) {
  const Icon = toast.type === "success" ? Check : toast.type === "error" ? CircleAlert : X;
  const color = toast.type === "success" ? "bg-emerald-600" : toast.type === "error" ? "bg-rose-600" : "bg-slate-800";
  return (
    <div className={`fixed left-1/2 top-20 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white shadow-lg ${color}`}>
      <Icon size={16} />
      {toast.message}
    </div>
  );
}

declare global {
  interface Window {
    __EXHIBITION_BOOKING_ROOT__?: Root;
  }
}

const rootElement = document.getElementById("root")!;
const root = window.__EXHIBITION_BOOKING_ROOT__ ?? createRoot(rootElement);
window.__EXHIBITION_BOOKING_ROOT__ = root;
root.render(<App />);
