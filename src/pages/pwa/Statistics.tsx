import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import {
  format,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subMonths,
} from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { ChevronLeft } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatPrice } from "@/lib/formatPrice";
import { useTherapistEarnings } from "@/hooks/pwa/useTherapistEarnings";

type Period = "today" | "thisWeek" | "thisMonth" | "lastMonth";

function getDateRange(period: Period): { start: string; end: string } {
  const now = new Date();
  switch (period) {
    case "today":
      return {
        start: format(startOfDay(now), "yyyy-MM-dd"),
        end: format(endOfDay(now), "yyyy-MM-dd"),
      };
    case "thisWeek":
      return {
        start: format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"),
        end: format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      };
    case "thisMonth":
      return {
        start: format(startOfMonth(now), "yyyy-MM-dd"),
        end: format(endOfMonth(now), "yyyy-MM-dd"),
      };
    case "lastMonth": {
      const lastMonth = subMonths(now, 1);
      return {
        start: format(startOfMonth(lastMonth), "yyyy-MM-dd"),
        end: format(endOfMonth(lastMonth), "yyyy-MM-dd"),
      };
    }
  }
}

const PwaStatistics = () => {
  const { t, i18n } = useTranslation("pwa");
  const navigate = useNavigate();

  const [therapistId, setTherapistId] = useState<string>();
  const [period, setPeriod] = useState<Period>("thisMonth");

  const dateLocale = i18n.language === "fr" ? fr : enUS;
  const { start, end } = useMemo(() => getDateRange(period), [period]);
  const { data: earnings, isLoading } = useTherapistEarnings(therapistId, start, end);

  useEffect(() => {
    const fetchTherapistId = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        navigate("/pwa/login");
        return;
      }
      const { data: therapist } = await supabase
        .from("therapists")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (therapist) {
        setTherapistId(therapist.id);
      }
    };
    fetchTherapistId();
  }, [navigate]);

  const chartData = useMemo(() => {
    if (!earnings?.dailyData) return [];
    return earnings.dailyData.map((d) => ({
      ...d,
      label: format(new Date(d.date + "T00:00:00"), "dd/MM"),
    }));
  }, [earnings?.dailyData]);

  const periods: { key: Period; label: string }[] = [
    { key: "today", label: t("statistics.today") },
    { key: "thisWeek", label: t("statistics.thisWeek") },
    { key: "thisMonth", label: t("statistics.thisMonth") },
    { key: "lastMonth", label: t("statistics.lastMonth") },
  ];

  // Rappel de la période sur le hero, en clair ("1 sept. - 30 sept.").
  const rangeLabel = start === end
    ? format(new Date(start + "T00:00:00"), "d MMM", { locale: dateLocale })
    : `${format(new Date(start + "T00:00:00"), "d MMM", { locale: dateLocale })} - ${format(new Date(end + "T00:00:00"), "d MMM", { locale: dateLocale })}`;

  const formatHours = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${h}h`;
  };

  return (
    <div className="app-refonte flex h-full min-h-0 flex-col">
      <header className="hdr" style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}>
        <button className="back-btn" onClick={() => navigate("/pwa/dashboard")} aria-label={t("common:buttons.back")}>
          <ChevronLeft size={18} />
        </button>
        <span style={{ fontSize: 18, fontWeight: 400 }}>{t("statistics.title")}</span>
        <div className="spacer" />
      </header>

      <div className="app-scroll" style={{ paddingBottom: 24 }}>
        <div className="seg grow" style={{ marginBottom: "calc(12px * var(--sp))" }}>
          {periods.map((p) => (
            <button key={p.key} className={period === p.key ? "on" : ""} onClick={() => setPeriod(p.key)}>
              {p.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="sk" style={{ height: 108, borderRadius: 20 }} />
            <div className="sk" style={{ height: 64 }} />
            <div className="sk" style={{ height: 200 }} />
            <div className="sk" style={{ height: 140 }} />
          </div>
        ) : (
          <>
            {/* Total de la période */}
            <div className="hero-card">
              <div className="glow" />
              <div className="hero-inner">
                <div className="hero-top">
                  <span className="lbl">{t("statistics.totalEarned")}</span>
                  <span className="in">{rangeLabel}</span>
                </div>
                <div className="hero-time">
                  {formatPrice(earnings?.totalEarned ?? 0, "EUR", { decimals: 0 })}
                </div>
              </div>
            </div>

            {/* KPIs secondaires */}
            <div className="fiche-when" style={{ margin: "calc(12px * var(--sp)) 16px 0" }}>
              <div className="cell">
                <div className="v">{earnings?.bookingCount ?? 0}</div>
                <div className="l">{t("statistics.bookingCount")}</div>
              </div>
              <div className="cell">
                <div className="v">{formatHours(earnings?.hoursWorked ?? 0)}</div>
                <div className="l">{t("statistics.hoursWorked")}</div>
              </div>
              <div className="cell">
                <div className="v">{formatPrice(earnings?.averagePerBooking ?? 0, "EUR", { decimals: 0 })}</div>
                <div className="l">{t("statistics.averagePerBooking")}</div>
              </div>
            </div>

            {chartData.length > 1 && (
              <>
                <div className="sec-label">{t("statistics.dailyEarnings")}</div>
                <div className="card chart-card">
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={chartData}>
                      <CartesianGrid vertical={false} stroke="var(--line-soft)" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: "var(--ink-mute)" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "var(--ink-mute)" }}
                        tickLine={false}
                        axisLine={false}
                        width={36}
                      />
                      <Tooltip
                        formatter={(value: number) => [
                          formatPrice(value, "EUR"),
                          t("statistics.totalEarned"),
                        ]}
                        labelFormatter={(label) => label}
                        cursor={{ fill: "var(--sand-200)", opacity: 0.5 }}
                        contentStyle={{
                          background: "var(--sand-50)",
                          border: "1px solid var(--line)",
                          borderRadius: 12,
                          fontSize: 12,
                          color: "var(--ink)",
                        }}
                      />
                      <Bar
                        dataKey="earnings"
                        fill="var(--accent)"
                        maxBarSize={18}
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}

            <div className="sec-label">{t("statistics.completedBookings")}</div>
            {!earnings?.bookings.length ? (
              <div className="card">
                <div className="stat-empty">{t("statistics.noData")}</div>
              </div>
            ) : (
              <div className="card">
                {earnings.bookings.map((booking) => (
                  <div key={booking.id} className="stat-row">
                    <div className="tx">
                      <div className="t">
                        {booking.client_first_name} {booking.client_last_name}
                      </div>
                      <div className="s">
                        {format(new Date(booking.booking_date + "T00:00:00"), "d MMM", { locale: dateLocale })}{" "}
                        {booking.booking_time?.substring(0, 5)} · {booking.hotel_name}
                      </div>
                    </div>
                    <div className="amt">
                      <div className="v">{formatPrice(booking.therapistShare, "EUR")}</div>
                      <div className="of">/ {formatPrice(booking.calculatedTotal, "EUR")}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PwaStatistics;
