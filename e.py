import xlsxwriter

# إنشاء ملف Excel جديد
workbook = xlsxwriter.Workbook('AI_telecom.xlsx')

# تنسيقات الخلايا
header_format = workbook.add_format({
    'bold': True,
    'bg_color': '#D7E4BC',
    'border': 1,
    'align': 'center',
    'valign': 'vcenter'
})
cell_format = workbook.add_format({
    'border': 1,
    'align': 'center',
    'valign': 'vcenter',
    'num_format': '#,##0.00'  # رقمين عشريين مع فاصل الآلاف
})
date_format = workbook.add_format({
    'border': 1,
    'align': 'center',
    'num_format': 'yyyy-mm-dd'
})
normal_format = workbook.add_format({
    'border': 1,
    'align': 'center',
    'valign': 'vcenter'
})

#################################################
# الورقة الأولى: "إحصائيات الذكاء الاصطناعي"
#################################################
worksheet1 = workbook.add_worksheet('إحصائيات الذكاء الاصطناعي')

# عناوين الجدول للورقة الأولى
headers1 = ['رقم الشركة', 'اسم الشركة', 'عدد العملاء قبل تطبيق الذكاء الاصطناعي', 
            'عدد العملاء بعد تطبيق الذكاء الاصطناعي', 'نسبة الزيادة في العملاء', 'تاريخ التطبيق']
for col, header in enumerate(headers1):
    worksheet1.write(0, col, header, header_format)

# بيانات حقيقية تقريبية (10 صفوف) من شركات الاتصالات في السعودية:
data1 = [
    [1, 'STC',                     20000000, 21000000, None, '2023-01-15'],
    [2, 'Mobily',                  15000000, 15750000, None, '2023-02-10'],
    [3, 'Zain KSA',                10000000, 10600000, None, '2023-03-05'],
    [4, 'Virgin Mobile Saudi Arabia', 2000000, 2100000, None, '2023-03-20'],
    [5, 'Lebara Mobile Saudi Arabia',  1000000, 1080000, None, '2023-04-10'],
    [6, 'STC - فرع الشرق',         5000000, 5250000,  None, '2023-04-15'],
    [7, 'STC - فرع الغرب',         4500000, 4725000,  None, '2023-04-20'],
    [8, 'Mobily - فرع الرياض',     6000000, 6300000,  None, '2023-05-05'],
    [9, 'Zain KSA - فرع جدة',      3000000, 3150000,  None, '2023-05-10'],
    [10,'Virgin Mobile - فرع الدمام',1500000, 1575000,  None, '2023-05-15'],
]

# كتابة البيانات في الجدول مع إضافة صيغة حساب نسبة الزيادة
for row_num, row_data in enumerate(data1, start=1):
    worksheet1.write(row_num, 0, row_data[0], normal_format)
    worksheet1.write(row_num, 1, row_data[1], normal_format)
    worksheet1.write_number(row_num, 2, row_data[2], cell_format)
    worksheet1.write_number(row_num, 3, row_data[3], cell_format)
    # صيغة حساب نسبة الزيادة: ((عدد العملاء بعد التطبيق - قبل التطبيق) / قبل التطبيق)*100
    formula = f"=((D{row_num+1}-C{row_num+1})/C{row_num+1})*100"
    worksheet1.write_formula(row_num, 4, formula, cell_format)
    worksheet1.write(row_num, 5, row_data[5], date_format)

# ضبط عرض الأعمدة
worksheet1.set_column(0, 0, 10)
worksheet1.set_column(1, 1, 30)
worksheet1.set_column(2, 3, 25)
worksheet1.set_column(4, 4, 20)
worksheet1.set_column(5, 5, 15)

# إضافة مخطط عمودي (Chart) يعرض نسبة الزيادة في العملاء
chart1 = workbook.add_chart({'type': 'column'})
chart1.add_series({
    'name':       'نسبة الزيادة في العملاء',
    'categories': ['إحصائيات الذكاء الاصطناعي', 1, 1, len(data1), 1],  # أسماء الشركات (العمود B)
    'values':     ['إحصائيات الذكاء الاصطناعي', 1, 4, len(data1), 4],  # النسب المحسوبة (العمود E)
})
chart1.set_title({'name': 'مخطط نسبة الزيادة في العملاء'})
chart1.set_x_axis({'name': 'الشركات'})
chart1.set_y_axis({'name': 'النسبة (%)', 'num_format': '0.00'})
worksheet1.insert_chart('H2', chart1, {'x_offset': 25, 'y_offset': 10})

#################################################
# الورقة الثانية: "تحليل الأداء"
#################################################
worksheet2 = workbook.add_worksheet('تحليل الأداء')

# عناوين الجدول للورقة الثانية
headers2 = ['رقم الشركة', 'اسم الشركة', 'الاستثمار في الذكاء الاصطناعي (ملايين ريال)', 
            'زيادة الإيرادات بعد التطبيق (ملايين ريال)', 'العائد على الاستثمار (ROI)', 'ملاحظات']
for col, header in enumerate(headers2):
    worksheet2.write(0, col, header, header_format)

# بيانات حقيقية تقريبية (10 صفوف) توضح استثمارات وعوائد الذكاء الاصطناعي:
data2 = [
    [1, 'STC',                     150, 20,  None, 'ROI متوسط'],
    [2, 'Mobily',                  120, 18,  None, 'ROI جيد'],
    [3, 'Zain KSA',                100, 16,  None, 'ROI جيد'],
    [4, 'Virgin Mobile Saudi Arabia', 30, 5,  None, 'ROI جيد'],
    [5, 'Lebara Mobile Saudi Arabia',  25, 4,  None, 'ROI جيد'],
    [6, 'STC - فرع الشرق',         50, 7,   None, 'ROI متوسط'],
    [7, 'STC - فرع الغرب',         45, 6.5, None, 'ROI متوسط'],
    [8, 'Mobily - فرع الرياض',     60, 9,   None, 'ROI جيد'],
    [9, 'Zain KSA - فرع جدة',      35, 5.5, None, 'ROI جيد'],
    [10,'Virgin Mobile - فرع الدمام',28, 4.2, None, 'ROI جيد'],
]

# كتابة البيانات في الجدول مع إضافة صيغة حساب ROI باستخدام دالة IF
for row_num, row_data in enumerate(data2, start=1):
    worksheet2.write(row_num, 0, row_data[0], normal_format)
    worksheet2.write(row_num, 1, row_data[1], normal_format)
    worksheet2.write_number(row_num, 2, row_data[2], cell_format)
    worksheet2.write_number(row_num, 3, row_data[3], cell_format)
    # صيغة حساب ROI: إذا كان الاستثمار 0 فإن ROI = 0، وإلا (زيادة الإيرادات/الاستثمار)*100
    formula = f"=IF(C{row_num+1}=0, 0, (D{row_num+1}/C{row_num+1})*100)"
    worksheet2.write_formula(row_num, 4, formula, cell_format)
    worksheet2.write(row_num, 5, row_data[5], normal_format)

# ضبط عرض الأعمدة للورقة الثانية
worksheet2.set_column(0, 0, 10)
worksheet2.set_column(1, 1, 30)
worksheet2.set_column(2, 3, 30)
worksheet2.set_column(4, 4, 25)
worksheet2.set_column(5, 5, 20)

# إضافة مخطط دائري (Pie Chart) يوضح توزيع الاستثمار في الذكاء الاصطناعي
chart2 = workbook.add_chart({'type': 'pie'})
chart2.add_series({
    'name':       'نسبة الاستثمار',
    'categories': ['تحليل الأداء', 1, 1, len(data2), 1],  # أسماء الشركات (العمود B)
    'values':     ['تحليل الأداء', 1, 2, len(data2), 2],  # قيم الاستثمار (العمود C)
})
chart2.set_title({'name': 'مخطط توزيع الاستثمار'})
worksheet2.insert_chart('H2', chart2, {'x_offset': 25, 'y_offset': 10})

#################################################
# إغلاق ملف Excel
#################################################
workbook.close()
print("تم إنشاء ملف 'AI_telecom.xlsx' بنجاح!")
