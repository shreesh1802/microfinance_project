-- Disable foreign key checks for dropping tables easily
SET FOREIGN_KEY_CHECKS = 0;

-- Create tables
CREATE TABLE IF NOT EXISTS self_help_groups (
    group_id INT PRIMARY KEY AUTO_INCREMENT,
    group_name VARCHAR(100) NOT NULL,
    village VARCHAR(100) NOT NULL,
    district VARCHAR(100) NOT NULL,
    total_members INT DEFAULT 0,
    formed_date DATE NOT NULL,
    monthly_savings DECIMAL(10,2) DEFAULT 0.00,
    status ENUM('Active', 'Inactive', 'Dissolved') DEFAULT 'Active'
);

CREATE TABLE IF NOT EXISTS users (
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
    FOREIGN KEY (group_id) REFERENCES self_help_groups(group_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS field_agents (
    agent_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(15) NOT NULL UNIQUE,
    region VARCHAR(100) NOT NULL,
    village_assigned VARCHAR(100),
    join_date DATE DEFAULT (CURRENT_DATE),
    status ENUM('Active', 'Inactive', 'Transferred') DEFAULT 'Active'
);

CREATE TABLE IF NOT EXISTS loan_applications (
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
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES field_agents(agent_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS loans (
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
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT,
    FOREIGN KEY (application_id) REFERENCES loan_applications(application_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS guarantors (
    guarantor_id INT PRIMARY KEY AUTO_INCREMENT,
    loan_id INT NOT NULL,
    guarantor_user_id INT,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(15),
    aadhaar VARCHAR(12),
    relationship VARCHAR(50),
    monthly_income DECIMAL(10,2),
    village VARCHAR(100),
    FOREIGN KEY (loan_id) REFERENCES loans(loan_id) ON DELETE CASCADE,
    FOREIGN KEY (guarantor_user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS disbursements (
    disbursement_id INT PRIMARY KEY AUTO_INCREMENT,
    loan_id INT NOT NULL UNIQUE,
    amount DECIMAL(12,2) NOT NULL,
    disbursement_method ENUM('Cash','Bank Transfer','UPI','Cheque') DEFAULT 'Cash',
    disbursed_by INT,
    disbursement_date DATE NOT NULL,
    recipient_signature BOOLEAN DEFAULT FALSE,
    witness_name VARCHAR(100),
    FOREIGN KEY (loan_id) REFERENCES loans(loan_id) ON DELETE RESTRICT,
    FOREIGN KEY (disbursed_by) REFERENCES field_agents(agent_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS emi_schedule (
    emi_id INT PRIMARY KEY AUTO_INCREMENT,
    loan_id INT NOT NULL,
    emi_number INT NOT NULL,
    due_date DATE NOT NULL,
    emi_amount DECIMAL(10,2) NOT NULL,
    status ENUM('Pending','Paid','Late','Missed') DEFAULT 'Pending',
    FOREIGN KEY (loan_id) REFERENCES loans(loan_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS repayments (
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
    FOREIGN KEY (loan_id) REFERENCES loans(loan_id) ON DELETE RESTRICT,
    FOREIGN KEY (collected_by) REFERENCES field_agents(agent_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS credit_scores (
    score_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    score INT NOT NULL,
    risk_category ENUM('Very Low','Low','Medium','High','Very High') NOT NULL,
    calculated_date DATE DEFAULT (CURRENT_DATE),
    notes VARCHAR(300),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS credit_score_factors (
    factor_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    factor_name VARCHAR(100) NOT NULL,
    factor_value VARCHAR(200),
    points_awarded INT NOT NULL DEFAULT 0,
    max_points INT NOT NULL,
    assessment_date DATE DEFAULT (CURRENT_DATE),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS credit_score_history (
    history_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    score INT NOT NULL,
    risk_category ENUM('Very Low','Low','Medium','High','Very High') NOT NULL,
    recorded_date DATE DEFAULT (CURRENT_DATE),
    change_reason VARCHAR(300),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS business_impact (
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
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (loan_id) REFERENCES loans(loan_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_log (
    log_id INT PRIMARY KEY AUTO_INCREMENT,
    action VARCHAR(50) NOT NULL,
    ref_id INT,
    description TEXT,
    log_time DATETIME DEFAULT CURRENT_TIMESTAMP
);

SET FOREIGN_KEY_CHECKS = 1;

-- Functions & Procedures
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
DELIMITER ;

DELIMITER //
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
DELIMITER ;

-- Triggers
DELIMITER //
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
DELIMITER ;

DELIMITER //
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
DELIMITER ;

DELIMITER //
CREATE TRIGGER trg_log_disbursement
AFTER INSERT ON disbursements
FOR EACH ROW
BEGIN
    INSERT INTO audit_log (action, ref_id, description, log_time)
    VALUES ('Loan_Disbursed', NEW.loan_id,
            CONCAT('Amount: ', NEW.amount,
                   ', Method: ', NEW.disbursement_method,
                   ', Agent: ', IFNULL(NEW.disbursed_by, 'N/A')),
            NOW());
END //
DELIMITER ;

-- Views
CREATE VIEW vw_manager_portfolio AS
SELECT
    shg.group_id,
    shg.group_name,
    shg.village,
    COUNT(DISTINCT l.loan_id) AS total_loans,
    SUM(l.principal_amount) AS total_disbursed,
    SUM(l.outstanding_balance) AS total_outstanding,
    SUM(CASE WHEN l.status = 'Active' THEN 1 ELSE 0 END) AS active_loans,
    SUM(CASE WHEN l.status = 'Defaulted' THEN 1 ELSE 0 END) AS defaulted_loans
FROM self_help_groups shg
LEFT JOIN users u ON u.group_id = shg.group_id
LEFT JOIN loans l ON u.user_id = l.user_id
GROUP BY shg.group_id, shg.group_name, shg.village;

CREATE VIEW vw_agent_collection AS
SELECT
    fa.agent_id, fa.name AS agent_name,
    u.name AS borrower_name, u.phone AS borrower_phone, u.village AS borrower_village,
    l.loan_id, es.emi_amount, es.due_date, es.status AS emi_status,
    CASE
        WHEN es.due_date < CURDATE() AND es.status = 'Pending' THEN 'OVERDUE'
        WHEN es.due_date = CURDATE() THEN 'DUE TODAY'
        ELSE 'UPCOMING'
    END AS urgency
FROM field_agents fa
JOIN loan_applications la ON fa.agent_id = la.agent_id
JOIN loans l ON la.application_id = l.application_id
JOIN users u ON l.user_id = u.user_id
JOIN emi_schedule es ON l.loan_id = es.loan_id
WHERE l.status = 'Active' AND es.status IN ('Pending', 'Late');

-- Insert Initial Dummy Data
INSERT INTO self_help_groups (group_name, village, district, total_members, formed_date, monthly_savings)
VALUES ('Mahila Shakti Group', 'Ramgarh', 'Jaipur', 10, '2023-05-15', 500.00);

INSERT INTO field_agents (name, phone, region, village_assigned)
VALUES ('Rajesh Kumar', '9988776655', 'Jaipur Rural', 'Ramgarh');

INSERT INTO users (name, phone, aadhaar, village, district, occupation, monthly_income, education, has_bank_account, group_id)
VALUES ('Lakshmi Devi', '9876543210', '123456789012', 'Ramgarh', 'Jaipur', 'Homemaker', 3000.00, '8th Grade', FALSE, 1),
       ('Sunita Meena', '9871234567', '567890123456', 'Ramgarh', 'Jaipur', 'Farmer', 4000.00, '5th Grade', TRUE, 1);

INSERT INTO loan_applications (user_id, agent_id, amount_requested, purpose, tenure_requested, status)
VALUES (1, 1, 25000.00, 'Small business - Tailoring', 18, 'Approved'),
       (2, 1, 15000.00, 'Agriculture', 12, 'Approved');

INSERT INTO loans (application_id, user_id, principal_amount, interest_rate, tenure_months, monthly_emi, disbursement_date, maturity_date, outstanding_balance, status)
VALUES (1, 1, 25000.00, 18.00, 18, 1595.00, '2024-11-25', '2026-05-25', 15000.00, 'Active'),
       (2, 2, 15000.00, 15.00, 12, 1353.00, '2024-12-01', '2025-12-01', 10000.00, 'Active');

INSERT INTO emi_schedule (loan_id, emi_number, due_date, emi_amount, status)
VALUES (1, 1, '2024-12-25', 1595.00, 'Paid'),
       (1, 2, '2025-01-25', 1595.00, 'Paid'),
       (1, 3, DATE_ADD(CURDATE(), INTERVAL -3 DAY), 1595.00, 'Pending'),
       (2, 1, '2025-01-01', 1353.00, 'Paid'),
       (2, 2, CURDATE(), 1353.00, 'Pending');
