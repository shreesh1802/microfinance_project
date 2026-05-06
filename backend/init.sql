-- Railway already creates a default database (usually named 'railway')
-- The tables and procedures will be created directly in it.

-- ============================================================
-- 1. TABLES
-- ============================================================
CREATE TABLE self_help_groups (
    group_id INT PRIMARY KEY AUTO_INCREMENT,
    group_name VARCHAR(100) NOT NULL,
    village VARCHAR(100) NOT NULL,
    district VARCHAR(100) NOT NULL,
    total_members INT DEFAULT 0,
    formed_date DATE NOT NULL,
    monthly_savings DECIMAL(10,2) DEFAULT 0.00,
    status ENUM('Active', 'Inactive', 'Dissolved') DEFAULT 'Active',
    CONSTRAINT chk_members CHECK (total_members >= 0),
    CONSTRAINT chk_savings CHECK (monthly_savings >= 0)
);

CREATE TABLE users (
    user_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(15) NOT NULL UNIQUE,
    aadhaar VARCHAR(12) UNIQUE,
    village VARCHAR(100),
    district VARCHAR(100),
    occupation VARCHAR(100),
    monthly_income DECIMAL(10,2),
    education VARCHAR(50),
    has_bank_account BOOLEAN DEFAULT FALSE,
    group_id INT,
    registration_date DATE DEFAULT (CURRENT_DATE),
    status ENUM('Active', 'Inactive', 'Blocked') DEFAULT 'Active',
    FOREIGN KEY (group_id) REFERENCES self_help_groups(group_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_income CHECK (monthly_income >= 0),
    CONSTRAINT chk_phone CHECK (phone REGEXP '^[0-9]{10}$')
);

CREATE TABLE field_agents (
    agent_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(15) NOT NULL UNIQUE,
    region VARCHAR(100) NOT NULL,
    village_assigned VARCHAR(100),
    join_date DATE DEFAULT (CURRENT_DATE),
    status ENUM('Active', 'Inactive', 'Transferred') DEFAULT 'Active',
    CONSTRAINT chk_agent_phone CHECK (phone REGEXP '^[0-9]{10}$')
);

CREATE TABLE loan_applications (
    application_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    agent_id INT,
    amount_requested DECIMAL(12,2) NOT NULL,
    purpose VARCHAR(200),
    tenure_requested INT,
    application_date DATE DEFAULT (CURRENT_DATE),
    status ENUM('Pending','Approved','Rejected','Cancelled') DEFAULT 'Pending',
    reviewed_by VARCHAR(100),
    review_date DATE,
    rejection_reason VARCHAR(300),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES field_agents(agent_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_amount CHECK (amount_requested > 0)
);

CREATE TABLE loans (
    loan_id INT PRIMARY KEY AUTO_INCREMENT,
    application_id INT NOT NULL UNIQUE,
    user_id INT NOT NULL,
    principal_amount DECIMAL(12,2) NOT NULL,
    interest_rate DECIMAL(5,2) NOT NULL,
    tenure_months INT NOT NULL,
    monthly_emi DECIMAL(10,2),
    disbursement_date DATE,
    maturity_date DATE,
    outstanding_balance DECIMAL(12,2),
    status ENUM('Active','Closed','Defaulted','Written_Off') DEFAULT 'Active',
    FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY (application_id) REFERENCES loan_applications(application_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_principal CHECK (principal_amount > 0),
    CONSTRAINT chk_rate CHECK (interest_rate > 0 AND interest_rate <= 100),
    CONSTRAINT chk_tenure CHECK (tenure_months > 0)
);

CREATE TABLE guarantors (
    guarantor_id INT PRIMARY KEY AUTO_INCREMENT,
    loan_id INT NOT NULL,
    guarantor_user_id INT,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(15),
    aadhaar VARCHAR(12),
    relationship VARCHAR(50),
    monthly_income DECIMAL(10,2),
    village VARCHAR(100),
    FOREIGN KEY (loan_id) REFERENCES loans(loan_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (guarantor_user_id) REFERENCES users(user_id)
        ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE disbursements (
    disbursement_id INT PRIMARY KEY AUTO_INCREMENT,
    loan_id INT NOT NULL UNIQUE,
    amount DECIMAL(12,2) NOT NULL,
    disbursement_method ENUM('Cash','Bank Transfer','UPI','Cheque') DEFAULT 'Cash',
    disbursed_by INT,
    disbursement_date DATE NOT NULL,
    recipient_signature BOOLEAN DEFAULT FALSE,
    witness_name VARCHAR(100),
    FOREIGN KEY (loan_id) REFERENCES loans(loan_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY (disbursed_by) REFERENCES field_agents(agent_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_disb_amount CHECK (amount > 0)
);

CREATE TABLE emi_schedule (
    emi_id INT PRIMARY KEY AUTO_INCREMENT,
    loan_id INT NOT NULL,
    emi_number INT NOT NULL,
    due_date DATE NOT NULL,
    emi_amount DECIMAL(10,2) NOT NULL,
    status ENUM('Pending','Paid','Late','Missed') DEFAULT 'Pending',
    FOREIGN KEY (loan_id) REFERENCES loans(loan_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_emi_amount CHECK (emi_amount > 0)
);

CREATE TABLE repayments (
    repayment_id INT PRIMARY KEY AUTO_INCREMENT,
    loan_id INT NOT NULL,
    due_date DATE NOT NULL,
    payment_date DATE NOT NULL,
    amount_paid DECIMAL(10,2) NOT NULL,
    penalty_amount DECIMAL(10,2) DEFAULT 0.00,
    payment_mode ENUM('Cash','Bank Transfer','UPI','Cheque') DEFAULT 'Cash',
    collected_by INT,
    status ENUM('On_Time','Late','Partial','Missed') DEFAULT 'On_Time',
    remarks VARCHAR(500),
    FOREIGN KEY (loan_id) REFERENCES loans(loan_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY (collected_by) REFERENCES field_agents(agent_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_paid CHECK (amount_paid >= 0)
);

CREATE TABLE credit_scores (
    score_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    score INT NOT NULL,
    risk_category ENUM('Very Low','Low','Medium','High','Very High') NOT NULL,
    calculated_date DATE DEFAULT (CURRENT_DATE),
    notes VARCHAR(300),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_score CHECK (score BETWEEN 0 AND 1000)
);

CREATE TABLE credit_score_factors (
    factor_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    factor_name VARCHAR(100) NOT NULL,
    factor_value VARCHAR(200),
    points_awarded INT NOT NULL DEFAULT 0,
    max_points INT NOT NULL,
    assessment_date DATE DEFAULT (CURRENT_DATE),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_points CHECK (points_awarded >= 0 AND points_awarded <= max_points)
);

CREATE TABLE credit_score_history (
    history_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    score INT NOT NULL,
    risk_category ENUM('Very Low','Low','Medium','High','Very High') NOT NULL,
    recorded_date DATE DEFAULT (CURRENT_DATE),
    change_reason VARCHAR(300),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_hist_score CHECK (score BETWEEN 0 AND 1000)
);

CREATE TABLE business_impact (
    impact_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    loan_id INT NOT NULL,
    business_type VARCHAR(100),
    assets_purchased TEXT,
    monthly_revenue DECIMAL(12,2) DEFAULT 0.00,
    monthly_profit DECIMAL(12,2) DEFAULT 0.00,
    employment_generated INT DEFAULT 0,
    customers_served INT DEFAULT 0,
    assessment_date DATE DEFAULT (CURRENT_DATE),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (loan_id) REFERENCES loans(loan_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_revenue CHECK (monthly_revenue >= 0),
    CONSTRAINT chk_employment CHECK (employment_generated >= 0)
);

CREATE TABLE audit_log (
    log_id INT PRIMARY KEY AUTO_INCREMENT,
    action VARCHAR(50) NOT NULL,
    ref_id INT,
    description TEXT,
    log_time DATETIME DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- 2. VIEWS
-- ============================================================
CREATE VIEW vw_manager_portfolio AS
SELECT
    shg.group_id,
    shg.group_name,
    shg.village,
    shg.district,
    COUNT(DISTINCT l.loan_id) AS total_loans,
    SUM(l.principal_amount) AS total_disbursed,
    SUM(l.outstanding_balance) AS total_outstanding,
    SUM(CASE WHEN l.status = 'Active' THEN 1 ELSE 0 END) AS active_loans,
    SUM(CASE WHEN l.status = 'Closed' THEN 1 ELSE 0 END) AS closed_loans,
    SUM(CASE WHEN l.status = 'Defaulted' THEN 1 ELSE 0 END) AS defaulted_loans,
    ROUND(
        SUM(CASE WHEN l.status = 'Defaulted' THEN 1 ELSE 0 END) * 100.0
        / NULLIF(COUNT(DISTINCT l.loan_id), 0), 2
    ) AS default_rate_pct
FROM self_help_groups shg
LEFT JOIN users u ON u.group_id = shg.group_id
LEFT JOIN loans l ON u.user_id = l.user_id
GROUP BY shg.group_id, shg.group_name, shg.village, shg.district;

CREATE VIEW vw_agent_collection AS
SELECT
    fa.agent_id,
    fa.name AS agent_name,
    fa.village_assigned,
    u.user_id,
    u.name AS borrower_name,
    u.phone AS borrower_phone,
    u.village AS borrower_village,
    l.loan_id,
    l.outstanding_balance,
    es.emi_number,
    es.due_date,
    es.emi_amount,
    es.status AS emi_status,
    CASE
        WHEN es.due_date < CURDATE() AND es.status = 'Pending' THEN 'OVERDUE'
        WHEN es.due_date = CURDATE() THEN 'DUE TODAY'
        WHEN es.due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY) THEN 'DUE THIS WEEK'
        ELSE 'UPCOMING'
    END AS urgency
FROM field_agents fa
JOIN loan_applications la ON fa.agent_id = la.agent_id
JOIN loans l ON la.application_id = l.application_id
JOIN users u ON l.user_id = u.user_id
JOIN emi_schedule es ON l.loan_id = es.loan_id
WHERE l.status = 'Active' AND es.status IN ('Pending', 'Late')
ORDER BY es.due_date ASC;

CREATE VIEW vw_credit_trend AS
SELECT
    u.name, csh.score, csh.risk_category, csh.recorded_date, csh.change_reason
FROM credit_score_history csh
JOIN users u ON csh.user_id = u.user_id
ORDER BY csh.recorded_date;

CREATE VIEW vw_social_impact AS
SELECT
    u.village,
    u.district,
    COUNT(DISTINCT u.user_id) AS total_borrowers,
    COUNT(DISTINCT l.loan_id) AS total_loans,
    SUM(l.principal_amount) AS total_amount_disbursed,
    SUM(CASE WHEN l.status = 'Closed' THEN 1 ELSE 0 END) AS loans_completed,
    ROUND(
        SUM(CASE WHEN l.status = 'Closed' THEN 1 ELSE 0 END) * 100.0
        / NULLIF(COUNT(DISTINCT l.loan_id), 0), 2
    ) AS completion_rate_pct,
    COUNT(DISTINCT bi.impact_id) AS businesses_tracked,
    IFNULL(SUM(bi.employment_generated), 0) AS total_employment_generated,
    IFNULL(ROUND(AVG(bi.monthly_revenue), 2), 0) AS avg_business_revenue,
    IFNULL(ROUND(AVG(bi.monthly_profit), 2), 0) AS avg_business_profit,
    IFNULL(SUM(bi.customers_served), 0) AS total_customers_served,
    SUM(CASE WHEN u.has_bank_account = TRUE THEN 1 ELSE 0 END) AS borrowers_with_bank_account
FROM users u
LEFT JOIN loans l ON u.user_id = l.user_id
LEFT JOIN business_impact bi ON u.user_id = bi.user_id
WHERE u.user_id IN (SELECT user_id FROM loans)
GROUP BY u.village, u.district
ORDER BY total_employment_generated DESC;


-- ============================================================
-- 3. FUNCTIONS & PROCEDURES (PL/SQL)
-- ============================================================
DELIMITER //

CREATE FUNCTION calculate_emi(
    p_principal DECIMAL(12,2),
    p_annual_rate DECIMAL(5,2),
    p_tenure_months INT
) RETURNS DECIMAL(10,2)
DETERMINISTIC
BEGIN
    DECLARE v_monthly_rate DECIMAL(10,8);
    DECLARE v_emi DECIMAL(10,2);

    SET v_monthly_rate = p_annual_rate / 12 / 100;

    IF v_monthly_rate = 0 THEN
        SET v_emi = p_principal / p_tenure_months;
    ELSE
        SET v_emi = p_principal * v_monthly_rate * POW(1 + v_monthly_rate, p_tenure_months)
                    / (POW(1 + v_monthly_rate, p_tenure_months) - 1);
    END IF;

    RETURN ROUND(v_emi, 2);
END //

CREATE PROCEDURE generate_emi_schedule(IN p_loan_id INT)
BEGIN
    DECLARE v_tenure INT;
    DECLARE v_emi DECIMAL(10,2);
    DECLARE v_start_date DATE;
    DECLARE v_counter INT DEFAULT 1;

    SELECT tenure_months, monthly_emi, disbursement_date
    INTO v_tenure, v_emi, v_start_date
    FROM loans WHERE loan_id = p_loan_id;

    WHILE v_counter <= v_tenure DO
        INSERT INTO emi_schedule (loan_id, emi_number, due_date, emi_amount)
        VALUES (p_loan_id, v_counter,
                DATE_ADD(v_start_date, INTERVAL v_counter MONTH), v_emi);
        SET v_counter = v_counter + 1;
    END WHILE;
END //

CREATE PROCEDURE calculate_credit_score(IN p_user_id INT)
BEGIN
    DECLARE v_score INT DEFAULT 0;
    DECLARE v_shg_months INT DEFAULT 0;
    DECLARE v_on_time_pct DECIMAL(5,2) DEFAULT 0;
    DECLARE v_income DECIMAL(10,2) DEFAULT 0;
    DECLARE v_has_bank BOOLEAN DEFAULT FALSE;
    DECLARE v_total_loans INT DEFAULT 0;
    DECLARE v_closed_loans INT DEFAULT 0;
    DECLARE v_risk VARCHAR(20);
    DECLARE v_pts INT;

    SELECT monthly_income, has_bank_account INTO v_income, v_has_bank
    FROM users WHERE user_id = p_user_id;

    SELECT TIMESTAMPDIFF(MONTH, shg.formed_date, CURDATE())
    INTO v_shg_months
    FROM users u JOIN self_help_groups shg ON u.group_id = shg.group_id
    WHERE u.user_id = p_user_id;

    SELECT COUNT(*), SUM(CASE WHEN status = 'Closed' THEN 1 ELSE 0 END)
    INTO v_total_loans, v_closed_loans
    FROM loans WHERE user_id = p_user_id;

    SELECT IFNULL(
        ROUND(SUM(CASE WHEN status = 'On_Time' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 2),
        0)
    INTO v_on_time_pct
    FROM repayments WHERE loan_id IN (SELECT loan_id FROM loans WHERE user_id = p_user_id);

    DELETE FROM credit_score_factors WHERE user_id = p_user_id AND assessment_date = CURDATE();

    SET v_pts = LEAST(v_shg_months * 8, 150);
    SET v_score = v_score + v_pts;
    INSERT INTO credit_score_factors (user_id, factor_name, factor_value, points_awarded, max_points)
    VALUES (p_user_id, 'SHG Membership Duration', CONCAT(v_shg_months, ' months'), v_pts, 150);

    SET v_pts = ROUND(v_on_time_pct * 3, 0);
    SET v_score = v_score + v_pts;
    INSERT INTO credit_score_factors (user_id, factor_name, factor_value, points_awarded, max_points)
    VALUES (p_user_id, 'Repayment History', CONCAT(v_on_time_pct, '% on-time'), v_pts, 300);

    SET v_pts = LEAST(ROUND(v_income / 50, 0), 200);
    SET v_score = v_score + v_pts;
    INSERT INTO credit_score_factors (user_id, factor_name, factor_value, points_awarded, max_points)
    VALUES (p_user_id, 'Income Stability', CONCAT('Rs. ', v_income, '/month'), v_pts, 200);

    SET v_pts = IF(v_has_bank, 100, 0);
    SET v_score = v_score + v_pts;
    INSERT INTO credit_score_factors (user_id, factor_name, factor_value, points_awarded, max_points)
    VALUES (p_user_id, 'Banking Relationship', IF(v_has_bank, 'Has bank account', 'No bank account'), v_pts, 100);

    SET v_pts = LEAST(v_closed_loans * 125, 250);
    SET v_score = v_score + v_pts;
    INSERT INTO credit_score_factors (user_id, factor_name, factor_value, points_awarded, max_points)
    VALUES (p_user_id, 'Loan Completion History', CONCAT(v_closed_loans, ' loans completed'), v_pts, 250);

    SET v_score = LEAST(v_score, 1000);

    SET v_risk = CASE
        WHEN v_score >= 800 THEN 'Very Low'
        WHEN v_score >= 600 THEN 'Low'
        WHEN v_score >= 400 THEN 'Medium'
        WHEN v_score >= 200 THEN 'High'
        ELSE 'Very High'
    END;

    IF EXISTS (SELECT 1 FROM credit_scores WHERE user_id = p_user_id) THEN
        UPDATE credit_scores SET score = v_score, risk_category = v_risk,
            calculated_date = CURDATE(), notes = CONCAT('Recalculated on ', CURDATE())
        WHERE user_id = p_user_id;
    ELSE
        INSERT INTO credit_scores (user_id, score, risk_category, notes)
        VALUES (p_user_id, v_score, v_risk, CONCAT('Auto-calculated on ', CURDATE()));
    END IF;

    INSERT INTO credit_score_history (user_id, score, risk_category, change_reason)
    VALUES (p_user_id, v_score, v_risk, 'Periodic recalculation');
END //

-- ============================================================
-- 4. TRIGGERS
-- ============================================================
CREATE TRIGGER trg_auto_close_loan
BEFORE UPDATE ON loans
FOR EACH ROW
BEGIN
    IF NEW.outstanding_balance <= 0 AND OLD.status = 'Active' THEN
        SET NEW.status = 'Closed';
        INSERT INTO audit_log (action, ref_id, description, log_time)
        VALUES ('Loan_Closed', NEW.loan_id,
                CONCAT('Loan auto-closed. Principal: ', NEW.principal_amount,
                       ', User: ', NEW.user_id), NOW());
    END IF;
END //

CREATE TRIGGER trg_check_late_payment
BEFORE INSERT ON repayments
FOR EACH ROW
BEGIN
    IF NEW.payment_date > NEW.due_date THEN
        SET NEW.status = 'Late';
        SET NEW.penalty_amount = NEW.amount_paid * 0.02;
    ELSE
        SET NEW.status = 'On_Time';
        SET NEW.penalty_amount = 0.00;
    END IF;
END //

CREATE TRIGGER trg_log_disbursement
AFTER INSERT ON disbursements
FOR EACH ROW
BEGIN
    INSERT INTO audit_log (action, ref_id, description, log_time)
    VALUES ('Loan_Disbursed', NEW.loan_id,
            CONCAT('Amount: ', NEW.amount,
                   ', Method: ', NEW.disbursement_method,
                   ', Agent: ', IFNULL(NEW.disbursed_by, 'N/A'),
                   ', Witness: ', IFNULL(NEW.witness_name, 'N/A')),
            NOW());
END //

DELIMITER ;

-- ============================================================
-- 5. SEED DATA
-- ============================================================
INSERT INTO self_help_groups (group_name, village, district, total_members, formed_date, monthly_savings)
VALUES ('Mahila Shakti Group', 'Ramgarh', 'Jaipur', 10, '2023-05-15', 500.00);

INSERT INTO field_agents (name, phone, region, village_assigned)
VALUES ('Rajesh Kumar', '9988776655', 'Jaipur Rural', 'Ramgarh');

INSERT INTO users (name, phone, aadhaar, village, district, occupation, monthly_income, education, has_bank_account, group_id)
VALUES
    ('Lakshmi Devi',  '9876543210', '123456789012', 'Ramgarh', 'Jaipur', 'Homemaker', 3000, '8th Grade', FALSE, 1),
    ('Sunita Meena',  '9871234567', '567890123456', 'Ramgarh', 'Jaipur', 'Farmer',    4000, '5th Grade', TRUE, 1),
    ('Radha Kumari',  '9876543211', '234567890123', 'Ramgarh', 'Jaipur', 'Tailor',    5000, '10th Grade',TRUE, 1);

INSERT INTO loan_applications (user_id, agent_id, amount_requested, purpose, tenure_requested, status, reviewed_by, review_date)
VALUES
    (1, 1, 25000, 'Small business - Tailoring', 18, 'Approved', 'Manager Priya', '2024-11-20'),
    (2, 1, 15000, 'Agriculture equipment',     12, 'Approved', 'Manager Priya', '2024-12-01');

INSERT INTO loans (application_id, user_id, principal_amount, interest_rate, tenure_months, monthly_emi, disbursement_date, maturity_date, outstanding_balance, status)
VALUES
    (1, 1, 25000, 18, 18, 1595, '2024-11-25', '2026-05-25', 15000, 'Active'),
    (2, 2, 15000, 15, 12, 1353, '2024-12-01', '2025-12-01', 10000, 'Active');

INSERT INTO disbursements (loan_id, amount, disbursement_method, disbursed_by, disbursement_date, recipient_signature, witness_name)
VALUES
    (1, 25000, 'Cash',         1, '2024-11-25', TRUE, 'SHG Leader Sunita'),
    (2, 15000, 'Bank Transfer',1, '2024-12-01', TRUE, 'Agent Rajesh');

INSERT INTO credit_scores (user_id, score, risk_category, notes)
VALUES
    (1, 720, 'Low',    'Good SHG history, consistent savings'),
    (2, 650, 'Medium', 'First-time borrower, verified by SHG'),
    (3, 780, 'Low',    'Experienced tailor, strong income');

INSERT INTO credit_score_history (user_id, score, risk_category, change_reason) VALUES
    (1, 600, 'Medium', 'Initial assessment Nov 2024'),
    (1, 680, 'Low',    '3 months on-time payments Feb 2025'),
    (1, 720, 'Low',    '6 months consistent repayment May 2025'),
    (2, 650, 'Medium', 'Initial assessment Dec 2024');

INSERT INTO repayments (loan_id, due_date, payment_date, amount_paid, payment_mode, collected_by, status, penalty_amount, remarks)
VALUES
    (1, '2024-12-25', '2024-12-23', 1595, 'Cash', 1, 'On_Time', 0,    'Paid 2 days early'),
    (1, '2025-01-25', '2025-01-25', 1595, 'Cash', 1, 'On_Time', 0,    'Paid on due date'),
    (1, '2025-02-25', '2025-02-28', 1000, 'Cash', 1, 'Late',    20,   'Partial - medical emergency'),
    (2, '2025-01-01', '2025-01-01', 1353, 'UPI',  1, 'On_Time', 0,    'On time via UPI');

INSERT INTO emi_schedule (loan_id, emi_number, due_date, emi_amount, status)
VALUES
    (1, 1, '2024-12-25', 1595, 'Paid'),
    (1, 2, '2025-01-25', 1595, 'Paid'),
    (1, 3, '2025-02-25', 1595, 'Late'),
    (1, 4, DATE_ADD(CURDATE(), INTERVAL 3 DAY), 1595, 'Pending'),
    (2, 1, '2025-01-01', 1353, 'Paid'),
    (2, 2, CURDATE(), 1353, 'Pending');

INSERT INTO business_impact (user_id, loan_id, business_type, assets_purchased, monthly_revenue, monthly_profit, employment_generated, customers_served)
VALUES (1, 1, 'Tailoring', 'Sewing machine (15000), Raw materials (10000)', 8000, 4500, 1, 25);
