import React, { useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Download,
  Home,
  QrCode,
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
  nowText,
  publicRemainingStock,
  remainingStock,
  statusText,
  validateBooking,
} from "./utils/business";

type ClientPage = "detail" | "center" | "confirm" | "success" | "my";
type AdminPage = "dashboard" | "activities" | "config" | "sessions" | "bookings" | "assist";
type AdminRole = "operator" | "sales";

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

function App() {
  const [state, setState] = useState<AppState>(initialState);
  const [mode, setMode] = useState<"client" | "admin">("client");
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
        session.sessionId === targetSession.sessionId && input.source !== "销售代客报名"
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
        session.sessionId === booking.sessionId && booking.source !== "销售代客报名"
          ? { ...session, bookedCount: Math.max(session.bookedCount - booking.bookingCount, 0) }
          : session,
      ),
    }));
    notify("报名已取消，库存已释放", "success");
  }

  function checkInBooking(bookingId: string) {
    // TODO API: 调用签到接口，真实场景需校验报名码、场次时间和后台操作权限。
    const signedAt = nowText();
    setState((current) => ({
      ...current,
      bookings: current.bookings.map((booking) =>
        booking.bookingId === bookingId && booking.status === "pending_checkin"
          ? { ...booking, status: "checked_in", checkedInAt: signedAt, signedInAt: signedAt }
          : booking,
      ),
    }));
    notify("已模拟签到该报名", "success");
  }

  function updateExhibition(next: Exhibition) {
    // TODO API: 保存 B 端活动配置。
    setState((current) => ({
      ...current,
      exhibitions: current.exhibitions.map((item) =>
        item.exhibitionId === next.exhibitionId ? next : item,
      ),
    }));
    notify("活动配置已保存，C 端展示已同步", "success");
  }

  function updateRule(next: BookingRule) {
    // TODO API: 保存 B 端报名规则配置。
    setState((current) => ({
      ...current,
      rules: current.rules.map((item) => (item.exhibitionId === next.exhibitionId ? next : item)),
    }));
    notify("报名规则已保存，C 端校验已同步", "success");
  }

  function updateSession(next: ExhibitionSession) {
    // TODO API: 保存场次信息和库存配置，并从后端读取最新库存。
    setState((current) => ({
      ...current,
      sessions: current.sessions.map((item) => (item.sessionId === next.sessionId ? next : item)),
    }));
    notify("场次已更新，库存展示已同步", "success");
  }

  function addSession(next: ExhibitionSession) {
    // TODO API: 新增场次应提交到后端，由后端返回场次 ID、库存和初始状态。
    setState((current) => ({ ...current, sessions: [...current.sessions, next] }));
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
      <main className="mx-auto max-w-7xl px-4 py-6">
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
            updateExhibition={updateExhibition}
            updateRule={updateRule}
            updateSession={updateSession}
            addSession={addSession}
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
  mode: "client" | "admin";
  setMode: (mode: "client" | "admin") => void;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div>
          <div className="text-sm text-slate-500">Demo</div>
          <h1 className="text-lg font-semibold text-slate-950">线下活动报名</h1>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
          <button
            className={`rounded-md px-4 py-2 text-sm font-medium ${mode === "client" ? "bg-slate-950 text-white shadow-sm" : "text-slate-600"}`}
            onClick={() => setMode("client")}
          >
            C 端小程序
          </button>
          <button
            className={`rounded-md px-4 py-2 text-sm font-medium ${mode === "admin" ? "bg-slate-950 text-white shadow-sm" : "text-slate-600"}`}
            onClick={() => setMode("admin")}
          >
            B 端后台
          </button>
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
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
          <BadgeText text={props.rule.loginRequired ? "必须登录" : "可游客报名"} />
          <BadgeText text={props.rule.selfOnly ? "仅限本人" : "允许代报名"} />
          <BadgeText text="仅限1人" />
          <BadgeText text={props.rule.oneSessionPerMember ? "限报一场" : "可报多场"} />
          <BadgeText text={props.rule.allowCancel ? `可取消，截止前 ${props.rule.cancelDeadlineHours} 小时` : "不可取消"} />
          <BadgeText text="约满不可报名" />
        </div>
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
      <button
        onClick={() => setPage("my")}
        className="h-12 w-full rounded-xl bg-slate-950 text-sm font-semibold text-white"
      >
        查看我的活动
      </button>
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
  updateExhibition: (next: Exhibition) => void;
  updateRule: (next: BookingRule) => void;
  updateSession: (next: ExhibitionSession) => void;
  addSession: (next: ExhibitionSession) => void;
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
    <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
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
          ["config", "活动配置", Settings],
          ["sessions", "场次管理", CalendarDays],
          ["bookings", "报名名单", Ticket],
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
            updateSession={props.updateSession}
            addSession={props.addSession}
          />
        )}
        {props.page === "bookings" && (
          <BookingList
            bookings={selectedBookings}
            exhibitions={props.state.exhibitions}
            sessions={props.state.sessions}
            cancelBooking={props.cancelBooking}
            checkInBooking={props.checkInBooking}
          />
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
        <AdminMetric label="总库存/对外库存" value={stats.totalStock} />
        <AdminMetric label="客用已报名人数" value={stats.booked} />
        <AdminMetric label="客用剩余库存" value={stats.remain} />
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
                        内部已代报名 {internalBookedCount(props.bookings, session.sessionId)} 人 · 不占用客用库存
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
              规则提示：销售代客报名仅可选择现有会员，不占用 C 端客用总库存，也不会影响客人看到的剩余名额；仍遵守活动上架、场次状态和每会员限约一场规则。
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
}) {
  return (
    <Panel title="活动列表">
      <Table>
        <thead>
          <tr>
            <Th>活动名称</Th>
            <Th>活动地点</Th>
            <Th>活动时间</Th>
            <Th>报名状态</Th>
            <Th>总报名人数</Th>
            <Th>操作</Th>
          </tr>
        </thead>
        <tbody>
          {props.exhibitions.map((item) => {
            const booked = props.bookings.filter(
              (booking) => booking.exhibitionId === item.exhibitionId && booking.status !== "cancelled",
            ).length;
            return (
              <tr key={item.exhibitionId} className="border-t border-slate-100">
                <Td className="font-medium text-slate-950">{item.title}</Td>
                <Td>{item.location}</Td>
                <Td>{formatRange(item.exhibitionStartTime, item.exhibitionEndTime)}</Td>
                <Td>{item.status === "published" ? "已上架" : item.status === "closed" ? "取消" : "下架"}</Td>
                <Td>{booked}</Td>
                <Td>
                  <div className="flex flex-wrap gap-2">
                    <AdminAction onClick={() => { props.setSelectedExhibitionId(item.exhibitionId); props.setPage("config"); }}>编辑</AdminAction>
                    <AdminAction onClick={() => { props.setSelectedExhibitionId(item.exhibitionId); props.setPage("dashboard"); }}>查看数据</AdminAction>
                    <AdminAction onClick={() => { props.setSelectedExhibitionId(item.exhibitionId); props.setPage("sessions"); }}>查看场次</AdminAction>
                    <AdminAction onClick={() => { props.setSelectedExhibitionId(item.exhibitionId); props.setPage("bookings"); }}>报名名单</AdminAction>
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </Panel>
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

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="活动配置">
        <div className="grid gap-3">
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
        </div>
      </Panel>
      <Panel title="报名规则配置">
        <div className="space-y-3">
          <ToggleRow label="必须登录" checked={ruleDraft.loginRequired} onChange={(loginRequired) => setRuleDraft({ ...ruleDraft, loginRequired })} />
          <ToggleRow label="仅限会员本人报名" checked={ruleDraft.selfOnly} onChange={(selfOnly) => setRuleDraft({ ...ruleDraft, selfOnly })} />
          <ReadonlyField label="每次报名人数" value="仅限1人" />
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
        </div>
      </Panel>
    </div>
  );
}

function AdminSessions({
  exhibitionId,
  sessions,
  bookings,
  updateSession,
  addSession,
}: {
  exhibitionId: string;
  sessions: ExhibitionSession[];
  bookings: Booking[];
  updateSession: (next: ExhibitionSession) => void;
  addSession: (next: ExhibitionSession) => void;
}) {
  const [creating, setCreating] = useState(false);

  return (
    <Panel
      title="场次管理"
      action={
        <button
          onClick={() => setCreating((value) => !value)}
          className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white"
        >
          {creating ? "收起新增" : "新增场次"}
        </button>
      }
    >
      {creating && (
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
            <Th>总库存/对外库存</Th>
            <Th>客用已报名</Th>
            <Th>客用剩余</Th>
            <Th>内部代报名</Th>
            <Th>状态</Th>
            <Th>操作</Th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <SessionRow key={session.sessionId} session={session} bookings={bookings} updateSession={updateSession} />
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
  });

  return (
    <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 text-sm font-semibold text-slate-950">新增场次</div>
      <div className="grid gap-3 md:grid-cols-5">
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
  updateSession,
}: {
  session: ExhibitionSession;
  bookings: Booking[];
  updateSession: (next: ExhibitionSession) => void;
}) {
  const [draft, setDraft] = useState(session);
  React.useEffect(() => setDraft(session), [session]);
  const displayStatus = displaySessionStatus(draft);

  return (
    <tr className="border-t border-slate-100 align-top">
      <Td><InlineInput value={draft.sessionName} onChange={(sessionName) => setDraft({ ...draft, sessionName })} /></Td>
      <Td>
        <InlineInput
          type="date"
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
            value={timePart(draft.startTime)}
            onChange={(startTime) => setDraft({ ...draft, startTime: composeDateTime(datePart(draft.startTime), startTime) })}
          />
          <InlineInput
            type="time"
            value={timePart(draft.endTime)}
            onChange={(endTime) => setDraft({ ...draft, endTime: composeDateTime(datePart(draft.startTime), endTime) })}
          />
        </div>
      </Td>
      <Td><InlineInput type="number" value={String(draft.totalStock)} onChange={(value) => setDraft({ ...draft, totalStock: Number(value) || 0 })} /></Td>
      <Td>{draft.bookedCount}</Td>
      <Td>{remainingStock(draft)}</Td>
      <Td>{internalBookedCount(bookings, draft.sessionId)}</Td>
      <Td>
        <StatusPill status={displayStatus} />
      </Td>
      <Td>
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
        </div>
      </Td>
    </tr>
  );
}

function BookingList(props: {
  bookings: Booking[];
  exhibitions: Exhibition[];
  sessions: ExhibitionSession[];
  cancelBooking: (bookingId: string) => void;
  checkInBooking: (bookingId: string) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<"all" | BookingStatus>("all");
  const rows = props.bookings.filter((item) => statusFilter === "all" || item.status === statusFilter);
  return (
    <Panel
      title="报名名单"
      action={
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | BookingStatus)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <option value="all">全部状态</option>
          <option value="pending_checkin">待签到</option>
          <option value="cancelled">已取消</option>
          <option value="checked_in">已签到</option>
          <option value="expired">已过期</option>
        </select>
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
                    <AdminAction onClick={() => window.alert(JSON.stringify(booking, null, 2))}>查看详情</AdminAction>
                    <AdminAction onClick={() => props.cancelBooking(booking.bookingId)}>取消报名</AdminAction>
                    <AdminAction onClick={() => props.checkInBooking(booking.bookingId)}>模拟签到</AdminAction>
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </Panel>
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

function BadgeText({ text }: { text: string }) {
  return <span className="rounded-lg bg-slate-100 px-2 py-1 text-center">{text}</span>;
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
  return <div className="scrollbar-thin overflow-x-auto"><table className="w-full min-w-[920px] border-collapse text-left text-sm">{children}</table></div>;
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap bg-slate-50 px-3 py-3 text-xs font-semibold uppercase text-slate-500">{children}</th>;
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-3 text-slate-600 ${className}`}>{children}</td>;
}

function AdminAction({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
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

function InlineInput({ value, onChange, type = "text" }: { value: string; onChange: (value: string) => void; type?: string }) {
  return <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="w-full min-w-28 rounded-lg border border-slate-200 px-2 py-1 text-sm" />;
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
