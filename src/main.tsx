import React, { useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Home,
  LogIn,
  LogOut,
  QrCode,
  ScanLine,
  Settings,
  Share2,
  ShieldCheck,
  Ticket,
  UserCircle2,
  UserRound,
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
  SessionStatus,
  ToastType,
} from "./types/domain";
import {
  bookingStatusText,
  canSelectSession,
  createBookingCode,
  displaySessionStatus,
  formatRange,
  nowText,
  remainingStock,
  statusText,
  validateBooking,
} from "./utils/business";

type ClientPage = "detail" | "center" | "confirm" | "success" | "my" | "scan";
type AdminPage = "dashboard" | "activities" | "config" | "sessions" | "bookings";

type Toast = {
  message: string;
  type: ToastType;
};

function App() {
  const [state, setState] = useState<AppState>(initialState);
  const [mode, setMode] = useState<"client" | "admin">("client");
  const [clientPage, setClientPage] = useState<ClientPage>("detail");
  const [adminPage, setAdminPage] = useState<AdminPage>("dashboard");
  const [selectedExhibitionId, setSelectedExhibitionId] = useState("EXH001");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [lastBookingId, setLastBookingId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const exhibition = state.exhibitions.find((item) => item.exhibitionId === selectedExhibitionId)!;
  const rule = state.rules.find((item) => item.exhibitionId === selectedExhibitionId)!;
  const sessions = state.sessions.filter((item) => item.exhibitionId === selectedExhibitionId);
  const selectedSession = state.sessions.find((item) => item.sessionId === selectedSessionId) ?? null;
  const lastBooking = state.bookings.find((item) => item.bookingId === lastBookingId) ?? null;

  function notify(message: string, type: ToastType = "info") {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 2600);
  }

  function login() {
    // TODO API: 获取当前登录会员，并用后端返回的会员身份覆盖本地登录态。
    setState((current) => ({ ...current, member: { ...current.member, isLoggedIn: true } }));
    notify("已模拟登录，会员信息来自登录态", "success");
  }

  function logout() {
    setState((current) => ({ ...current, member: { ...current.member, isLoggedIn: false } }));
    setClientPage("detail");
    setSelectedSessionId(null);
    notify("已退出模拟登录", "info");
  }

  function scanSignIn() {
    if (rule.loginRequired && !state.member.isLoggedIn) {
      notify("请先登录会员账号后再签到", "error");
      setClientPage("scan");
      return;
    }
    const activeBooking = state.bookings.find(
      (booking) =>
        booking.exhibitionId === selectedExhibitionId &&
        booking.memberId === state.member.memberId &&
        booking.status === "pending_use",
    );
    if (!activeBooking) {
      setClientPage("scan");
      notify("未查询到可签到预约，请先预约后续场次", "error");
      return;
    }
    // TODO API: 微信扫码现场二维码后，应由后端校验预约记录并写入签到时间、签到来源和现场二维码点位。
    setState((current) => ({
      ...current,
      bookings: current.bookings.map((booking) =>
        booking.bookingId === activeBooking.bookingId && !booking.signedInAt
          ? { ...booking, signedInAt: nowText(), signInSource: "现场二维码" }
          : booking,
      ),
    }));
    setLastBookingId(activeBooking.bookingId);
    setClientPage("scan");
    notify("现场签到成功", "success");
  }

  async function shareActivity() {
    const shareUrl = window.location.href;
    const shareData = {
      title: exhibition.title,
      text: `${exhibition.title}，可在松赞小程序预约线下展览活动。`,
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        notify("已唤起分享面板", "success");
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      notify("分享链接已复制", "success");
    } catch {
      notify("分享已取消或暂不可用", "info");
    }
  }

  function submitBooking(noticeAccepted: boolean) {
    if (!selectedSession) return;
    // TODO API: 提交预约前应由后端重新校验登录态、会员身份、规则和实时库存。
    const error = validateBooking({
      member: state.member,
      exhibition,
      rule,
      session: selectedSession,
      bookings: state.bookings,
      noticeAccepted,
    });
    if (error) {
      notify(error, "error");
      return;
    }

    const booking: Booking = {
      bookingId: `BKG${Date.now()}`,
      bookingCode: createBookingCode(),
      exhibitionId: exhibition.exhibitionId,
      sessionId: selectedSession.sessionId,
      memberId: state.member.memberId,
      memberName: state.member.name,
      memberPhone: state.member.phone,
      memberLevel: state.member.level,
      bookingCount: 1,
      status: "pending_use",
      source: "小程序",
      createdAt: nowText(),
    };

    setState((current) => ({
      ...current,
      sessions: current.sessions.map((session) =>
        session.sessionId === selectedSession.sessionId
          ? { ...session, bookedCount: Math.min(session.bookedCount + 1, session.totalStock) }
          : session,
      ),
      bookings: [booking, ...current.bookings],
    }));
    setLastBookingId(booking.bookingId);
    setClientPage("success");
    notify("预约成功，已生成入场凭证", "success");
  }

  function cancelBooking(bookingId: string) {
    const booking = state.bookings.find((item) => item.bookingId === bookingId);
    if (!booking) return;
    const matchedRule = state.rules.find((item) => item.exhibitionId === booking.exhibitionId);
    if (!matchedRule?.allowCancel) {
      notify("当前活动不允许取消预约", "error");
      return;
    }
    if (booking.status !== "pending_use") {
      notify("只有待使用预约可以取消", "error");
      return;
    }
    // TODO API: 调用取消预约接口，由后端释放库存并返回最新场次库存。
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
    notify("预约已取消，库存已释放", "success");
  }

  function checkInBooking(bookingId: string) {
    // TODO API: 调用核销接口，真实场景需校验预约码、场次时间和核销权限。
    setState((current) => ({
      ...current,
      bookings: current.bookings.map((booking) =>
        booking.bookingId === bookingId && booking.status === "pending_use"
          ? { ...booking, status: "checked_in", checkedInAt: nowText() }
          : booking,
      ),
    }));
    notify("已模拟核销该预约", "success");
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
    // TODO API: 保存 B 端预约规则配置。
    setState((current) => ({
      ...current,
      rules: current.rules.map((item) => (item.exhibitionId === next.exhibitionId ? next : item)),
    }));
    notify("预约规则已保存，C 端校验已同步", "success");
  }

  function updateSession(next: ExhibitionSession) {
    // TODO API: 保存场次信息和库存配置，并从后端读取最新库存。
    setState((current) => ({
      ...current,
      sessions: current.sessions.map((item) => (item.sessionId === next.sessionId ? next : item)),
    }));
    notify("场次已更新，库存展示已同步", "success");
  }

  function addSession() {
    const next: ExhibitionSession = {
      sessionId: `SES${Date.now()}`,
      exhibitionId: selectedExhibitionId,
      sessionName: "新增场次",
      startTime: "2026-06-25 14:00",
      endTime: "2026-06-25 16:00",
      totalStock: 30,
      bookedCount: 0,
      status: "open",
    };
    setState((current) => ({ ...current, sessions: [...current.sessions, next] }));
    notify("已新增场次", "success");
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
            login={login}
            logout={logout}
            selectSession={(sessionId) => {
              if (rule.loginRequired && !state.member.isLoggedIn) {
                notify("请先登录会员账号后再预约", "error");
                return;
              }
              const session = state.sessions.find((item) => item.sessionId === sessionId);
              if (!session || !canSelectSession(session)) {
                notify("该场次当前不可预约", "error");
                return;
              }
              setSelectedSessionId(sessionId);
              setClientPage("confirm");
            }}
            submitBooking={submitBooking}
            cancelBooking={cancelBooking}
            scanSignIn={scanSignIn}
            shareActivity={shareActivity}
          />
        ) : (
          <AdminShell
            state={state}
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
          />
        )}
      </main>
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
          <h1 className="text-lg font-semibold text-slate-950">线下展览活动预约报名</h1>
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
  login: () => void;
  logout: () => void;
  selectSession: (sessionId: string) => void;
  submitBooking: (noticeAccepted: boolean) => void;
  cancelBooking: (bookingId: string) => void;
  scanSignIn: () => void;
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
            member={props.state.member}
            exhibition={props.exhibition}
            rule={props.rule}
            sessions={props.sessions}
            login={props.login}
            logout={props.logout}
            selectSession={props.selectSession}
            shareActivity={props.shareActivity}
          />
        )}
        {props.page === "center" && (
          <MiniProgramCenter
            member={props.state.member}
            bookings={myBookings}
            login={props.login}
            logout={props.logout}
            setPage={props.setPage}
          />
        )}
        {props.page === "confirm" && props.selectedSession && (
          <ConfirmBooking
            member={props.state.member}
            exhibition={props.exhibition}
            session={props.selectedSession}
            notice={props.exhibition.notice}
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
        {props.page === "scan" && (
          <ScanSignInPage
            member={props.state.member}
            bookings={myBookings}
            exhibitions={props.state.exhibitions}
            sessions={props.state.sessions}
            login={props.login}
            setPage={props.setPage}
            scanSignIn={props.scanSignIn}
          />
        )}
        <ClientBottomTabs page={props.page} setPage={props.setPage} />
      </div>
    </div>
  );
}

function ClientBottomTabs({ page, setPage }: { page: ClientPage; setPage: (page: ClientPage) => void }) {
  const tabs: Array<{ key: ClientPage; label: string; icon: React.ElementType }> = [
    { key: "detail", label: "活动预约demo页", icon: Home },
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

function MiniProgramCenter(props: {
  member: AppState["member"];
  bookings: Booking[];
  login: () => void;
  logout: () => void;
  setPage: (page: ClientPage) => void;
}) {
  return (
    <div className="space-y-4 p-4">
      <section className="rounded-2xl bg-slate-950 p-5 text-white shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm text-slate-300">松赞会员</div>
            <h2 className="mt-2 text-xl font-semibold">{props.member.isLoggedIn ? props.member.name : "游客"}</h2>
            <p className="mt-1 text-sm text-slate-300">
              {props.member.isLoggedIn ? `${props.member.level} · ${props.member.memberId}` : "登录后查看预约和签到状态"}
            </p>
          </div>
          <UserCircle2 size={42} className="text-slate-300" />
        </div>
        <button
          onClick={props.member.isLoggedIn ? props.logout : props.login}
          className="mt-5 h-10 w-full rounded-xl bg-white text-sm font-semibold text-slate-950"
        >
          {props.member.isLoggedIn ? "退出登录" : "模拟登录"}
        </button>
      </section>

      <section className="rounded-2xl bg-white p-2 shadow-sm">
        <CenterMenuItem
          icon={<Ticket size={18} />}
          title="我的预约"
          desc="查看预约凭证、取消预约和签到状态"
          onClick={() => props.setPage("my")}
        />
        <CenterMenuItem
          icon={<ScanLine size={18} />}
          title="现场扫码签到"
          desc="模拟微信扫描现场二维码后签到"
          onClick={() => props.setPage("scan")}
        />
        <CenterMenuItem
          icon={<CalendarDays size={18} />}
          title="预约后续场次"
          desc="返回活动预约 Demo 页选择日期和场次"
          onClick={() => props.setPage("detail")}
        />
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-950">Demo 说明</div>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          本页模拟松赞小程序个人中心。活动预约只是其中一个业务入口，会员从个人中心进入预约记录，也可以在到场后通过微信扫码完成签到。
        </p>
      </section>
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

function ScanSignInPage(props: {
  member: AppState["member"];
  bookings: Booking[];
  exhibitions: Exhibition[];
  sessions: ExhibitionSession[];
  login: () => void;
  setPage: (page: ClientPage) => void;
  scanSignIn: () => void;
}) {
  const latestActive = props.bookings.find((booking) => booking.status === "pending_use");
  const latestSigned = props.bookings.find((booking) => Boolean(booking.signedInAt));
  const targetBooking = latestSigned ?? latestActive;
  const exhibition = targetBooking
    ? props.exhibitions.find((item) => item.exhibitionId === targetBooking.exhibitionId)
    : null;
  const session = targetBooking
    ? props.sessions.find((item) => item.sessionId === targetBooking.sessionId)
    : null;

  return (
    <div className="space-y-4 p-4">
      <section className="rounded-2xl bg-white p-5 text-center shadow-sm">
        <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50">
          <QrCode size={76} className="text-slate-400" />
        </div>
        <h2 className="mt-4 text-xl font-semibold text-slate-950">现场二维码签到</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          模拟客人到场后使用微信扫描现场二维码。系统会校验当前会员是否存在待使用预约，只有预约过活动的会员才能签到。
        </p>
      </section>

      {!props.member.isLoggedIn ? (
        <section className="rounded-2xl bg-white p-4 text-center shadow-sm">
          <CircleAlert className="mx-auto text-amber-600" size={34} />
          <div className="mt-3 text-sm font-semibold text-slate-950">请先登录后签到</div>
          <p className="mt-2 text-sm text-slate-500">签到需要读取当前会员身份，不能代他人签到。</p>
          <button onClick={props.login} className="mt-4 h-11 w-full rounded-xl bg-slate-950 text-sm font-semibold text-white">
            模拟登录
          </button>
        </section>
      ) : targetBooking && targetBooking.signedInAt ? (
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <CheckCircle2 size={18} />
            签到成功
          </div>
          <InfoRow label="展览" value={exhibition?.title ?? "-"} />
          <InfoRow label="场次" value={session ? formatRange(session.startTime, session.endTime) : "-"} />
          <InfoRow label="会员" value={targetBooking.memberName} />
          <InfoRow label="预约码" value={targetBooking.bookingCode} />
          <InfoRow label="签到时间" value={targetBooking.signedInAt} />
          <InfoRow label="签到来源" value={targetBooking.signInSource ?? "现场二维码"} />
          <button onClick={() => props.setPage("my")} className="mt-4 h-11 w-full rounded-xl bg-slate-950 text-sm font-semibold text-white">
            查看我的预约
          </button>
        </section>
      ) : latestActive ? (
        <section className="rounded-2xl bg-white p-4 text-center shadow-sm">
          <div className="text-sm font-semibold text-slate-950">已识别到预约记录</div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {exhibition?.title} · {session ? formatRange(session.startTime, session.endTime) : ""}
          </p>
          <button onClick={props.scanSignIn} className="mt-4 h-11 w-full rounded-xl bg-slate-950 text-sm font-semibold text-white">
            模拟微信扫码签到
          </button>
        </section>
      ) : (
        <section className="rounded-2xl bg-white p-4 text-center shadow-sm">
          <CircleAlert className="mx-auto text-rose-600" size={34} />
          <div className="mt-3 text-sm font-semibold text-slate-950">未查询到可签到预约</div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            只有预约过活动的会员才能签到。请先返回活动预约 Demo 页，选择后续开放场次完成预约。
          </p>
          <button onClick={() => props.setPage("detail")} className="mt-4 h-11 w-full rounded-xl bg-slate-950 text-sm font-semibold text-white">
            去预约后续场次
          </button>
        </section>
      )}
    </div>
  );
}

function ClientBookingHome(props: {
  member: AppState["member"];
  exhibition: Exhibition;
  rule: BookingRule;
  sessions: ExhibitionSession[];
  login: () => void;
  logout: () => void;
  selectSession: (sessionId: string) => void;
  shareActivity: () => void;
}) {
  const bookingDates = useMemo(() => getSessionDates(props.sessions), [props.sessions]);
  const [selectedDate, setSelectedDate] = useState(bookingDates[0] ?? "");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const selectedSessions = props.sessions.filter((session) => datePart(session.startTime) === selectedDate);

  React.useEffect(() => {
    if (!bookingDates.includes(selectedDate)) {
      setSelectedDate(bookingDates[0] ?? "");
    }
  }, [bookingDates, selectedDate]);

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
            {props.exhibition.status === "published" ? "预约开放中" : "未上架"}
          </div>
          <h2 className="text-2xl font-semibold leading-tight text-slate-950">{props.exhibition.title}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">{props.exhibition.description}</p>
          <InfoRow label="展览地点" value={props.exhibition.location} />
          <InfoRow
            label="展览时间"
            value={formatRange(props.exhibition.exhibitionStartTime, props.exhibition.exhibitionEndTime)}
          />
          <InfoRow
            label="预约开放"
            value={formatRange(props.exhibition.bookingStartTime, props.exhibition.bookingEndTime)}
          />
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <CalendarDays size={18} />
            选择预约日期
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
              onClick={() => setSelectedDate(date)}
            />
          ))}
        </div>
        {calendarOpen && (
          <CalendarSheet
            dates={bookingDates}
            selectedDate={selectedDate}
            sessions={props.sessions}
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
          <h3 className="text-sm font-semibold text-slate-950">{selectedDate ? `${formatDateLabel(selectedDate)} 场次` : "预约场次"}</h3>
          <span className="text-xs text-slate-500">库存实时联动后台</span>
        </div>
        {selectedSessions.length === 0 ? (
          <div className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">当日暂无可展示场次</div>
        ) : (
          <div className="space-y-3">
            {selectedSessions.map((session) => (
              <SessionCard key={session.sessionId} session={session} selectSession={props.selectSession} />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-950">
          <UserRound size={18} />
          当前会员
        </div>
        {props.member.isLoggedIn ? (
          <div className="space-y-2 text-sm">
            <ReadonlyField label="会员ID" value={props.member.memberId} />
            <ReadonlyField label="姓名" value={props.member.name} />
            <ReadonlyField label="手机号" value={props.member.phone} />
            <ReadonlyField label="会员等级" value={props.member.level} />
            <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">
              身份信息来自登录态，仅展示不可编辑。预约仅限会员本人，人数固定为 1。
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center">
            <p className="mb-3 text-sm text-slate-600">登录后才可预约，Demo 使用模拟登录态。</p>
            <button
              onClick={props.login}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
            >
              <LogIn size={16} />
              模拟登录
            </button>
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-2 text-sm font-semibold text-slate-950">活动详细介绍</div>
        <p className="text-sm leading-6 text-slate-600">
          本展览采用分场次预约入场。会员完成预约后将在小程序内获得预约码和二维码占位凭证，现场可由工作人员通过后台模拟核销。
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-600">{props.exhibition.description}</p>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-950">
          <ShieldCheck size={18} />
          具体活动规则
        </div>
        <p className="text-sm leading-6 text-slate-600">{props.exhibition.notice}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
          <BadgeText text={props.rule.loginRequired ? "必须登录" : "可游客预约"} />
          <BadgeText text={props.rule.selfOnly ? "仅限本人" : "允许代约"} />
          <BadgeText text="人数固定 1 人" />
          <BadgeText text={props.rule.oneSessionPerMember ? "限约一场" : "可约多场"} />
          <BadgeText text={props.rule.allowCancel ? `可取消，截止前 ${props.rule.cancelDeadlineHours} 小时` : "不可取消"} />
          <BadgeText text="约满不可预约" />
        </div>
      </section>

      <div className="sticky bottom-0 -mx-4 bg-white/90 p-4 backdrop-blur">
        <div className="flex gap-2">
          {props.member.isLoggedIn && (
            <button
              onClick={props.logout}
              className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 text-slate-600"
              title="退出登录"
            >
              <LogOut size={18} />
            </button>
          )}
          {props.member.isLoggedIn ? (
            <div className="flex h-12 flex-1 items-center justify-center rounded-xl bg-slate-950 text-sm font-semibold text-white">
              请选择日期和场次预约
            </div>
          ) : (
            <button
              onClick={props.login}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-semibold text-white"
            >
              <LogIn size={16} />
              模拟登录后预约
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SessionCard({
  session,
  selectSession,
}: {
  session: ExhibitionSession;
  selectSession: (sessionId: string) => void;
}) {
  const displayStatus = displaySessionStatus(session);
  const disabled = !canSelectSession(session);
  return (
    <button
      disabled={disabled}
      onClick={() => selectSession(session.sessionId)}
      className={`w-full rounded-2xl border p-4 text-left transition ${disabled ? "border-slate-200 bg-slate-50 opacity-60" : "border-slate-950 bg-white hover:-translate-y-0.5"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-950">{session.sessionName}</div>
          <div className="mt-1 text-sm text-slate-600">{timePart(session.startTime)} - {timePart(session.endTime)}</div>
        </div>
        <StatusPill status={displayStatus} />
      </div>
      <div className="mt-4 grid grid-cols-3 rounded-xl bg-slate-50 p-3 text-center text-xs">
        <MetricMini label="总库存" value={session.totalStock} />
        <MetricMini label="已预约" value={session.bookedCount} />
        <MetricMini label="剩余" value={remainingStock(session)} />
      </div>
    </button>
  );
}

function DateChip({
  date,
  active,
  sessions,
  onClick,
}: {
  date: string;
  active: boolean;
  sessions: ExhibitionSession[];
  onClick: () => void;
}) {
  const openCount = sessions.filter((session) => canSelectSession(session)).length;
  const remain = sessions.reduce((sum, session) => sum + remainingStock(session), 0);
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
  onSelect,
  onClose,
}: {
  dates: string[];
  selectedDate: string;
  sessions: ExhibitionSession[];
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
            <div className="text-sm font-semibold text-slate-950">选择预约日期</div>
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
            const remain = daySessions.reduce((sum, session) => sum + remainingStock(session), 0);
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
        <p className="mt-3 text-xs leading-5 text-slate-500">只有配置了预约场次的日期可以点击，点击后会展示当日场次与实时剩余库存。</p>
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
  notice: string;
  submitBooking: (noticeAccepted: boolean) => void;
}) {
  const [accepted, setAccepted] = useState(false);
  return (
    <div className="space-y-4 p-4">
      <h2 className="text-lg font-semibold text-slate-950">确认预约</h2>
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-semibold text-slate-950">预约人信息</div>
        <ReadonlyField label="会员ID" value={props.member.memberId} />
        <ReadonlyField label="姓名" value={props.member.name} />
        <ReadonlyField label="手机号" value={props.member.phone} />
        <ReadonlyField label="预约人数" value="1 人" />
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
          不支持填写其他人姓名、修改手机号或选择多人；本预约凭证仅限当前会员本人使用。
        </p>
      </section>
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-semibold text-slate-950">预约内容</div>
        <InfoRow label="展览" value={props.exhibition.title} />
        <InfoRow label="地点" value={props.exhibition.location} />
        <InfoRow label="场次" value={formatRange(props.session.startTime, props.session.endTime)} />
      </section>
      <label className="flex items-start gap-3 rounded-2xl bg-white p-4 text-sm text-slate-700 shadow-sm">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-slate-950"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
        />
        <span>我已阅读并同意预约须知：{props.notice}</span>
      </label>
      <button
        onClick={() => props.submitBooking(accepted)}
        className="h-12 w-full rounded-xl bg-slate-950 text-sm font-semibold text-white"
      >
        提交预约
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
        <h2 className="mt-3 text-xl font-semibold text-slate-950">预约成功</h2>
        <p className="mt-1 text-sm text-slate-500">请在入场时出示以下凭证</p>
        <div className="mx-auto mt-5 flex h-36 w-36 items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50">
          <QrCode size={78} className="text-slate-400" />
        </div>
        <div className="mt-3 font-mono text-lg font-semibold tracking-wide text-slate-950">
          {booking.bookingCode}
        </div>
      </section>
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <InfoRow label="展览名称" value={exhibition.title} />
        <InfoRow label="场次时间" value={formatRange(session.startTime, session.endTime)} />
        <InfoRow label="展览地点" value={exhibition.location} />
        <InfoRow label="会员姓名" value={booking.memberName} />
        <InfoRow label="手机号" value={booking.memberPhone} />
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">
          入场须知：预约码仅限会员本人使用，请按场次到场。二维码为 Demo 占位，后续可接入真实凭证生成与核销接口。
        </p>
      </section>
      <button
        onClick={() => setPage("my")}
        className="h-12 w-full rounded-xl bg-slate-950 text-sm font-semibold text-white"
      >
        查看我的预约
      </button>
    </div>
  );
}

function MyBookings(props: {
  bookings: Booking[];
  exhibitions: Exhibition[];
  sessions: ExhibitionSession[];
  cancelBooking: (bookingId: string) => void;
}) {
  return (
    <div className="space-y-3 p-4">
      <h2 className="text-lg font-semibold text-slate-950">我的预约</h2>
      {props.bookings.length === 0 && (
        <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          暂无当前会员预约记录
        </div>
      )}
      {props.bookings.map((booking) => {
        const exhibition = props.exhibitions.find((item) => item.exhibitionId === booking.exhibitionId)!;
        const session = props.sessions.find((item) => item.sessionId === booking.sessionId)!;
        return (
          <section key={booking.bookingId} className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-950">{exhibition.title}</div>
                <div className="mt-1 text-sm text-slate-600">{formatRange(session.startTime, session.endTime)}</div>
              </div>
              <BookingStatusPill status={booking.status} />
            </div>
            <div className="mt-4 rounded-xl bg-slate-50 p-3 font-mono text-sm text-slate-700">
              {booking.bookingCode}
            </div>
            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
              签到状态：
              <span className={booking.signedInAt ? "font-semibold text-emerald-700" : "font-semibold text-slate-500"}>
                {booking.signedInAt ? `已签到 · ${booking.signedInAt}` : "未签到"}
              </span>
            </div>
            <div className="mt-3 flex gap-2">
              <button className="flex-1 rounded-xl border border-slate-200 py-2 text-sm font-medium text-slate-700">
                查看详情
              </button>
              <button
                disabled={booking.status !== "pending_use"}
                onClick={() => props.cancelBooking(booking.bookingId)}
                className="flex-1 rounded-xl bg-slate-950 py-2 text-sm font-medium text-white disabled:bg-slate-200 disabled:text-slate-500"
              >
                取消预约
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function AdminShell(props: {
  state: AppState;
  selectedExhibitionId: string;
  setSelectedExhibitionId: (id: string) => void;
  page: AdminPage;
  setPage: (page: AdminPage) => void;
  updateExhibition: (next: Exhibition) => void;
  updateRule: (next: BookingRule) => void;
  updateSession: (next: ExhibitionSession) => void;
  addSession: () => void;
  cancelBooking: (bookingId: string) => void;
  checkInBooking: (bookingId: string) => void;
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
        {[
          ["dashboard", "数据看板", BarChart3],
          ["activities", "活动列表", ClipboardList],
          ["config", "活动配置", Settings],
          ["sessions", "场次管理", CalendarDays],
          ["bookings", "报名名单", Ticket],
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
        <div className="mt-5 px-2 text-xs font-semibold uppercase text-slate-400">当前活动</div>
        <select
          value={props.selectedExhibitionId}
          onChange={(event) => props.setSelectedExhibitionId(event.target.value)}
          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          {props.state.exhibitions.map((item) => (
            <option key={item.exhibitionId} value={item.exhibitionId}>
              {item.title}
            </option>
          ))}
        </select>
      </aside>
      <section className="min-w-0">
        {props.page === "dashboard" && (
          <Dashboard sessions={selectedSessions} bookings={selectedBookings} />
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
          <AdminSessions sessions={selectedSessions} updateSession={props.updateSession} addSession={props.addSession} />
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
      </section>
    </div>
  );
}

function Dashboard({ sessions, bookings }: { sessions: ExhibitionSession[]; bookings: Booking[] }) {
  const stats = useMemo(() => {
    const totalStock = sessions.reduce((sum, item) => sum + item.totalStock, 0);
    const booked = sessions.reduce((sum, item) => sum + item.bookedCount, 0);
    return {
      totalStock,
      booked,
      remain: totalStock - booked,
      signed: bookings.filter((item) => Boolean(item.signedInAt)).length,
      checked: bookings.filter((item) => item.status === "checked_in").length,
      cancelled: bookings.filter((item) => item.status === "cancelled").length,
    };
  }, [sessions, bookings]);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-6">
        <AdminMetric label="总库存" value={stats.totalStock} />
        <AdminMetric label="已预约人数" value={stats.booked} />
        <AdminMetric label="剩余库存" value={stats.remain} />
        <AdminMetric label="签到人数" value={stats.signed} />
        <AdminMetric label="核销人数" value={stats.checked} />
        <AdminMetric label="取消人数" value={stats.cancelled} />
      </div>
      <Panel title="各场次预约情况">
        <div className="space-y-4">
          {sessions.map((session) => {
            const percent = session.totalStock ? Math.round((session.bookedCount / session.totalStock) * 100) : 0;
            const signed = bookings.filter(
              (booking) => booking.sessionId === session.sessionId && Boolean(booking.signedInAt),
            ).length;
            return (
              <div key={session.sessionId}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{session.sessionName}</span>
                  <span className="text-slate-500">
                    预约 {session.bookedCount}/{session.totalStock} · 签到 {signed}
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
            <Th>展览地点</Th>
            <Th>展览时间</Th>
            <Th>预约状态</Th>
            <Th>总预约人数</Th>
            <Th>操作</Th>
          </tr>
        </thead>
        <tbody>
          {props.exhibitions.map((item) => {
            const booked = props.sessions
              .filter((session) => session.exhibitionId === item.exhibitionId)
              .reduce((sum, session) => sum + session.bookedCount, 0);
            return (
              <tr key={item.exhibitionId} className="border-t border-slate-100">
                <Td className="font-medium text-slate-950">{item.title}</Td>
                <Td>{item.location}</Td>
                <Td>{formatRange(item.exhibitionStartTime, item.exhibitionEndTime)}</Td>
                <Td>{item.status === "published" ? "已上架" : item.status === "closed" ? "已关闭" : "草稿"}</Td>
                <Td>{booked}</Td>
                <Td>
                  <div className="flex flex-wrap gap-2">
                    <AdminAction onClick={() => { props.setSelectedExhibitionId(item.exhibitionId); props.setPage("config"); }}>编辑</AdminAction>
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
          <TextInput label="展览名称" value={draft.title} onChange={(title) => setDraft({ ...draft, title })} />
          <TextInput label="主图 URL" value={draft.coverImage} onChange={(coverImage) => setDraft({ ...draft, coverImage })} />
          <TextArea label="展览简介" value={draft.description} onChange={(description) => setDraft({ ...draft, description })} />
          <TextInput label="展览地点" value={draft.location} onChange={(location) => setDraft({ ...draft, location })} />
          <div className="grid gap-3 md:grid-cols-2">
            <TextInput label="展览开始时间" value={draft.exhibitionStartTime} onChange={(exhibitionStartTime) => setDraft({ ...draft, exhibitionStartTime })} />
            <TextInput label="展览结束时间" value={draft.exhibitionEndTime} onChange={(exhibitionEndTime) => setDraft({ ...draft, exhibitionEndTime })} />
            <TextInput label="预约开始时间" value={draft.bookingStartTime} onChange={(bookingStartTime) => setDraft({ ...draft, bookingStartTime })} />
            <TextInput label="预约结束时间" value={draft.bookingEndTime} onChange={(bookingEndTime) => setDraft({ ...draft, bookingEndTime })} />
          </div>
          <TextArea label="预约须知" value={draft.notice} onChange={(notice) => setDraft({ ...draft, notice })} />
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
      <Panel title="预约规则配置">
        <div className="space-y-3">
          <ToggleRow label="必须登录" checked={ruleDraft.loginRequired} onChange={(loginRequired) => setRuleDraft({ ...ruleDraft, loginRequired })} />
          <ToggleRow label="仅限会员本人预约" checked={ruleDraft.selfOnly} onChange={(selfOnly) => setRuleDraft({ ...ruleDraft, selfOnly })} />
          <ReadonlyField label="每次预约人数" value="固定 1 人" />
          <ToggleRow label="每会员只能预约一个场次" checked={ruleDraft.oneSessionPerMember} onChange={(oneSessionPerMember) => setRuleDraft({ ...ruleDraft, oneSessionPerMember })} />
          <ToggleRow label="允许取消预约" checked={ruleDraft.allowCancel} onChange={(allowCancel) => setRuleDraft({ ...ruleDraft, allowCancel })} />
          <TextInput
            label="取消截止时间（活动开始前小时）"
            value={String(ruleDraft.cancelDeadlineHours)}
            onChange={(value) => setRuleDraft({ ...ruleDraft, cancelDeadlineHours: Number(value) || 0 })}
          />
          <button className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white" onClick={() => props.updateRule(ruleDraft)}>
            保存预约规则
          </button>
        </div>
      </Panel>
    </div>
  );
}

function AdminSessions({
  sessions,
  updateSession,
  addSession,
}: {
  sessions: ExhibitionSession[];
  updateSession: (next: ExhibitionSession) => void;
  addSession: () => void;
}) {
  return (
    <Panel title="场次管理" action={<button onClick={addSession} className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white">新增场次</button>}>
      <Table>
        <thead>
          <tr>
            <Th>场次名称</Th>
            <Th>日期</Th>
            <Th>时间</Th>
            <Th>总库存</Th>
            <Th>已预约</Th>
            <Th>剩余</Th>
            <Th>状态</Th>
            <Th>操作</Th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <SessionRow key={session.sessionId} session={session} updateSession={updateSession} />
          ))}
        </tbody>
      </Table>
    </Panel>
  );
}

function SessionRow({
  session,
  updateSession,
}: {
  session: ExhibitionSession;
  updateSession: (next: ExhibitionSession) => void;
}) {
  const [draft, setDraft] = useState(session);
  React.useEffect(() => setDraft(session), [session]);

  return (
    <tr className="border-t border-slate-100 align-top">
      <Td><InlineInput value={draft.sessionName} onChange={(sessionName) => setDraft({ ...draft, sessionName })} /></Td>
      <Td>{draft.startTime.slice(0, 10)}</Td>
      <Td>
        <div className="space-y-2">
          <InlineInput value={draft.startTime} onChange={(startTime) => setDraft({ ...draft, startTime })} />
          <InlineInput value={draft.endTime} onChange={(endTime) => setDraft({ ...draft, endTime })} />
        </div>
      </Td>
      <Td><InlineInput type="number" value={String(draft.totalStock)} onChange={(value) => setDraft({ ...draft, totalStock: Number(value) || 0 })} /></Td>
      <Td>{draft.bookedCount}</Td>
      <Td>{remainingStock(draft)}</Td>
      <Td>
        <select
          value={draft.status}
          onChange={(event) => setDraft({ ...draft, status: event.target.value as SessionStatus })}
          className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
        >
          <option value="pending">未开放</option>
          <option value="open">可预约</option>
          <option value="ended">已结束</option>
          <option value="closed">已关闭</option>
        </select>
      </Td>
      <Td>
        <div className="flex gap-2">
          <AdminAction onClick={() => updateSession(draft)}>保存</AdminAction>
          <AdminAction onClick={() => updateSession({ ...draft, status: "closed" })}>关闭场次</AdminAction>
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
          <option value="pending_use">待使用</option>
          <option value="cancelled">已取消</option>
          <option value="checked_in">已核销</option>
          <option value="expired">已过期</option>
        </select>
      }
    >
      <Table>
        <thead>
          <tr>
            <Th>预约码</Th>
            <Th>会员信息</Th>
            <Th>活动名称</Th>
            <Th>场次时间</Th>
            <Th>状态</Th>
            <Th>签到状态</Th>
            <Th>签到时间</Th>
            <Th>预约时间</Th>
            <Th>来源</Th>
            <Th>操作</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((booking) => {
            const exhibition = props.exhibitions.find((item) => item.exhibitionId === booking.exhibitionId)!;
            const session = props.sessions.find((item) => item.sessionId === booking.sessionId)!;
            return (
              <tr key={booking.bookingId} className="border-t border-slate-100">
                <Td className="font-mono">{booking.bookingCode}</Td>
                <Td>
                  <div className="font-medium text-slate-950">{booking.memberName}</div>
                  <div className="text-xs text-slate-500">{booking.memberId} / {booking.memberPhone} / {booking.memberLevel}</div>
                </Td>
                <Td>{exhibition.title}</Td>
                <Td>{formatRange(session.startTime, session.endTime)}</Td>
                <Td>{bookingStatusText(booking.status)}</Td>
                <Td>
                  <span className={booking.signedInAt ? "font-medium text-emerald-700" : "text-slate-400"}>
                    {booking.signedInAt ? "已签到" : "未签到"}
                  </span>
                </Td>
                <Td>
                  <div>{booking.signedInAt ?? "-"}</div>
                  <div className="text-xs text-slate-400">{booking.signInSource ?? ""}</div>
                </Td>
                <Td>{booking.createdAt}</Td>
                <Td>{booking.source}</Td>
                <Td>
                  <div className="flex flex-wrap gap-2">
                    <AdminAction onClick={() => window.alert(JSON.stringify(booking, null, 2))}>查看详情</AdminAction>
                    <AdminAction onClick={() => props.cancelBooking(booking.bookingId)}>取消预约</AdminAction>
                    <AdminAction onClick={() => props.checkInBooking(booking.bookingId)}>模拟核销</AdminAction>
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
    status === "pending_use"
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
